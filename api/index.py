import os, io, json, time, base64, logging, tempfile
from functools import wraps
from abc import ABC, abstractmethod
from io import BytesIO

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv

import requests
from PIL import Image, UnidentifiedImageError

from openai import OpenAI
import google.generativeai as genai

load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("scribe-api")

def retry_with_backoff(max_retries=3, base_delay=1):
    def deco(fn):
        @wraps(fn)
        def wrap(*a, **k):
            for i in range(max_retries):
                try: return fn(*a, **k)
                except Exception as e:
                    if i == max_retries-1: log.error("Final attempt failed for %s: %s", fn.__name__, e); raise
                    time.sleep(base_delay * (2 ** i))
        return wrap
    return deco

# ---------- Providers ----------
class BaseProvider(ABC):
    @abstractmethod
    def get_response(self, transcript=None, image_url=None, image_base64=None): ...

    @abstractmethod
    def stream_response(self, transcript): ...

class OpenAIProvider(BaseProvider):
    def __init__(self):
        key = os.getenv("OPENAI_API_KEY")
        if not key: raise ValueError("OPENAI_API_KEY not configured")
        base_url = os.getenv("OPENAI_BASE_URL")  # LiteLLM proxy support
        self.client = OpenAI(api_key=key, base_url=base_url) if base_url else OpenAI(api_key=key)
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")
        log.info("OpenAI provider init: model=%s base_url=%s", self.model, base_url or "default")

    @retry_with_backoff()
    def get_response(self, transcript=None, image_url=None, image_base64=None):
        messages = []
        if transcript and (image_url or image_base64):
            content = [{"type": "text", "text": transcript}]
            if image_base64:
                content.append({"type":"image_url","image_url":{"url": image_base64}})
            elif image_url:
                content.append({"type":"image_url","image_url":{"url": image_url}})
            messages.append({"role":"user","content":content})
        elif transcript:
            messages.append({"role":"user","content":transcript})
        else:
            if not (image_url or image_base64): return {"error":"No input provided"}
            content = [{"type":"text","text":"Analyze this image and summarize key insights."}]
            if image_base64:
                content.append({"type":"image_url","image_url":{"url": image_base64}})
            else:
                content.append({"type":"image_url","image_url":{"url": image_url}})
            messages.append({"role":"user","content":content})

        resp = self.client.chat.completions.create(model=self.model, messages=messages)
        return {"answer": resp.choices[0].message.content}

    def stream_response(self, transcript):
        yield f"data: {json.dumps({'error':'OpenAI streaming not used here'})}\n\n"

class GoogleProvider(BaseProvider):
    def __init__(self):
        key = os.getenv("GOOGLE_API_KEY")
        if not key: raise ValueError("GOOGLE_API_KEY not configured")
        genai.configure(api_key=key, transport="rest")
        self.model_name = os.getenv("GOOGLE_MODEL", "gemini-2.0-flash")
        log.info("Initializing GoogleProvider with model: %s", self.model_name)
        self.model = genai.GenerativeModel(self.model_name)

    def _pil_from_base64(self, data_uri:str):
        header, encoded = data_uri.split(",",1)
        b = base64.b64decode(encoded)
        try:
            return Image.open(BytesIO(b))
        except UnidentifiedImageError:
            raise ValueError("Invalid image data")

    def _pil_from_url(self, url:str):
        r = requests.get(url, headers={"User-Agent":"Mozilla/5.0"}, timeout=10)
        if r.status_code != 200: raise ValueError(f"Image download failed HTTP {r.status_code}")
        try: return Image.open(BytesIO(r.content))
        except UnidentifiedImageError: raise ValueError("Failed to decode image")

    @retry_with_backoff()
    def get_response(self, transcript=None, image_url=None, image_base64=None):
        parts = []
        if transcript: parts.append(transcript)
        if image_base64: parts.append(self._pil_from_base64(image_base64))
        elif image_url:  parts.append(self._pil_from_url(image_url))
        if not parts: return {"error":"No input provided"}
        
        try:
            log.info("Generating content for model %s (parts: %d)", self.model_name, len(parts))
            resp = self.model.generate_content(parts)
            return {"answer": resp.text}
        except Exception as e:
            log.warning("Primary Gemini call failed: %s", e)
            try:
                # Attempt to log available models to help debugging
                available = [m.name for m in genai.list_models()]
                log.info("Available models: %s", available)
                
                # Try a very safe fallback if available
                fallback_name = "models/gemini-1.5-flash" if "models/gemini-1.5-flash" in available else available[0]
                log.info("Trying fallback to %s", fallback_name)
                
                fallback = genai.GenerativeModel(fallback_name)
                resp = fallback.generate_content(parts)
                return {"answer": resp.text}
            except Exception as e2:
                log.error("Gemini critical failure: %s", e2)
                return {"error": f"AI Error: {str(e2)}"}

    def stream_response(self, transcript):
        yield f"data: {json.dumps({'error':'Gemini streaming not used here'})}\n\n"

PROVIDERS = {"openai": OpenAIProvider, "google": GoogleProvider}

def get_provider(name):
    cls = PROVIDERS.get(name)
    if not cls: raise ValueError("Invalid provider")
    return cls()

# ---------- Flask ----------
app = Flask(__name__)
CORS(app, resources={r"/*":{"origins":["chrome-extension://*","http://localhost:*","http://127.0.0.1:*"]}})

import mimetypes
from flask import send_file

@app.get("/favicon.ico")
@app.get("/favicon.png")
def favicon():
    ico = os.path.join(os.path.dirname(__file__), "favicon.png")
    if os.path.exists(ico):
        return send_file(ico, mimetype="image/png")
    return "", 204

@app.get("/")
def root():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Scribe API</title>
  <link rel="icon" type="image/png" href="/favicon.png">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#0d1117;color:#f0f6fc;min-height:100vh;display:flex;align-items:center;justify-content:center;}
    .card{text-align:center;padding:48px 40px;max-width:480px;}
    .icon{width:80px;height:80px;border-radius:20px;margin:0 auto 24px;display:block;box-shadow:0 0 40px rgba(88,166,255,0.35);}
    h1{font-size:28px;font-weight:700;letter-spacing:-0.5px;margin-bottom:8px;}
    .badge{display:inline-block;background:rgba(63,185,80,0.15);color:#3fb950;border:1px solid rgba(63,185,80,0.3);border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;margin-bottom:24px;}
    p{color:#8b949e;font-size:14px;line-height:1.7;margin-bottom:32px;}
    .endpoints{background:#161b22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;text-align:left;}
    .endpoint{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;}
    .endpoint:last-child{border-bottom:none;}
    .method{background:rgba(88,166,255,0.15);color:#58a6ff;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;font-family:monospace;flex-shrink:0;}
    .path{color:#e6edf3;font-family:monospace;font-size:12px;}
    .desc{color:#8b949e;font-size:11px;margin-left:auto;}
  </style>
</head>
<body>
  <div class="card">
    <img class="icon" src="/favicon.png" alt="Scribe">
    <h1>Scribe API</h1>
    <div class="badge">● API Running</div>
    <p>AI-powered live transcription, screen capture analysis,<br>and real-time Q&amp;A for the Scribe Chrome extension.</p>
    <div class="endpoints">
      <div class="endpoint"><span class="method">POST</span><span class="path">/api/transcribe</span><span class="desc">Audio → text</span></div>
      <div class="endpoint"><span class="method">POST</span><span class="path">/api/answer</span><span class="desc">AI Q&amp;A</span></div>
      <div class="endpoint"><span class="method">POST</span><span class="path">/api/sessions</span><span class="desc">Save session</span></div>
      <div class="endpoint"><span class="method">GET</span><span class="path">/api/sessions</span><span class="desc">List sessions</span></div>
      <div class="endpoint"><span class="method">GET</span><span class="path">/health</span><span class="desc">Health check</span></div>
    </div>
  </div>
</body>
</html>
""", 200, {"Content-Type": "text/html"}

@app.get("/health")
def health(): return jsonify({"status":"ok"}), 200

@app.post("/api/answer")
def answer():
    try:
        data = request.get_json(force=True) or {}
        provider_name = data.get("provider","google")
        transcript = data.get("transcript")
        image_url = data.get("imageUrl")
        image_base64 = data.get("imageBase64")

        provider = get_provider(provider_name)
        result = provider.get_response(transcript=transcript, image_url=image_url, image_base64=image_base64)
        if "error" in result: return jsonify(result), 400
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        log.exception("answer failed")
        return jsonify({"error":"Server error"}), 500

# -------- Simple chunked STT (Whisper-1) --------
# Accepts audioBase64 (webm/opus) chunks and returns incremental text.
from werkzeug.utils import secure_filename

@app.post("/api/transcribe")
def transcribe():
    try:
        data = request.get_json(force=True) or {}
        audio_b64 = data.get("audioBase64")
        mime = data.get("mimeType","audio/webm")
        session_id = secure_filename(data.get("sessionId","default"))
        if not audio_b64: return jsonify({"error":"No audioBase64"}), 400

        # decode to temp file
        if "," in audio_b64:
            header, encoded = audio_b64.split(",",1)
        else:
            encoded = audio_b64
        
        buf = base64.b64decode(encoded)
        log.info("Received audio chunk: %d bytes, mime=%s", len(buf), mime)
        
        if len(buf) < 100:
            return jsonify({"text": "", "method": "skip", "debug": "chunk too small"}), 200
        
        suffix = ".webm" if "webm" in mime else ".ogg" if "ogg" in mime else ".mp3"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(buf)
            tmp_path = f.name

        text = ""
        method = "none"
        debug_info = ""
        
        # Try OpenAI Whisper first (supports LiteLLM proxy via OPENAI_BASE_URL)
        oai_key = os.getenv("OPENAI_API_KEY")
        oai_base = os.getenv("OPENAI_BASE_URL")
        if oai_key:
            try:
                client = OpenAI(api_key=oai_key, base_url=oai_base) if oai_base else OpenAI(api_key=oai_key)
                with open(tmp_path, "rb") as fp:
                    tr = client.audio.transcriptions.create(model="whisper-1", file=fp)
                text = getattr(tr, "text", "").strip()
                method = "whisper"
                debug_info = f"whisper returned {len(text)} chars"
                log.info("Whisper result: '%s'", text[:100])
            except Exception as e:
                debug_info = f"whisper error: {str(e)[:100]}"
                log.warning("Whisper failed: %s, trying Gemini fallback", e)
        else:
            debug_info = "no OPENAI_API_KEY"
        
        # Fallback to Google Gemini for audio transcription (with retry for 429)
        if not text:
            google_key = os.getenv("GOOGLE_API_KEY")
            if google_key:
                genai.configure(api_key=google_key, transport="rest")
                audio_mime = mime if mime else "audio/webm"
                audio_part = {
                    "inline_data": {
                        "mime_type": audio_mime,
                        "data": encoded
                    }
                }
                prompt = "Transcribe this audio exactly. Output ONLY the spoken words, nothing else. If there is music but no speech, output just the word MUSIC. If completely silent, output SILENT."
                
                # Try with retry + model fallback for rate limits
                models_to_try = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "models/gemini-1.5-flash"]
                for model_name in models_to_try:
                    for attempt in range(3):
                        try:
                            model = genai.GenerativeModel(model_name)
                            resp = model.generate_content([prompt, audio_part])
                            raw = resp.text.strip() if resp.text else ""
                            method = f"gemini({model_name})"
                            debug_info += f" | {model_name} returned: '{raw[:60]}'"
                            if raw and raw not in ("MUSIC", "SILENT", ""):
                                text = raw
                            log.info("Gemini STT [%s] result: '%s'", model_name, raw[:100])
                            break
                        except Exception as e2:
                            err_str = str(e2)
                            if "429" in err_str and attempt < 2:
                                time.sleep(2 * (attempt + 1))  # 2s, 4s backoff
                                continue
                            debug_info += f" | {model_name} err: {err_str[:60]}"
                            log.warning("Gemini STT [%s] attempt %d failed: %s", model_name, attempt, e2)
                            break
                    if text:
                        break
            else:
                debug_info += " | no GOOGLE_API_KEY"
        
        try: os.remove(tmp_path)
        except: pass
        
        return jsonify({"text": text, "method": method, "debug": debug_info})
    except Exception as e:
        log.exception("transcribe failed")
        return jsonify({"error": f"Transcription error: {str(e)}"}), 500

# -------- Cloud Persistence (MongoDB) --------
import pymongo
from datetime import datetime

MONGO_URI = os.getenv("MONGODB_URI")
db_client = None
sessions_col = None

if MONGO_URI:
    try:
        db_client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = db_client.get_database("scribe")
        sessions_col = db.get_collection("sessions")
        log.info("Connected to MongoDB Atlas")
    except Exception as e:
        log.warning("Could not connect to MongoDB: %s", e)

def get_session_data():
    if sessions_col is not None:
        try:
            return list(sessions_col.find({}, {"_id": 0}).sort("timestamp", -1).limit(100))
        except: return []
    return []

@app.get("/api/sessions")
def get_sessions():
    return jsonify(get_session_data()), 200

@app.post("/api/sessions")
def create_session():
    try:
        data = request.get_json(force=True) or {}
        sid = data.get("id")
        if not sid: return jsonify({"error":"No session ID"}), 400
        
        data["updated_at"] = datetime.utcnow().isoformat()
        
        if sessions_col is not None:
            sessions_col.update_one({"id": sid}, {"$set": data}, upsert=True)
            return jsonify({"status":"synced to cloud"}), 200
        else:
            return jsonify({"status":"local only (no DB config)"}), 200
    except Exception as e:
        log.exception("session save failed")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    host = os.getenv("HOST","0.0.0.0")
    port = int(os.getenv("PORT",5055))
    debug = os.getenv("DEBUG","true").lower()=="true"
    log.info("Starting AnswerAI API on %s:%s (debug=%s)", host, port, debug)
    app.run(host=host, port=port, debug=debug)
