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
    def get_response(self, transcript=None, image_url=None, image_base64=None, image_array=None): ...

    @abstractmethod
    def stream_response(self, transcript): ...

class OpenAIProvider(BaseProvider):
    def __init__(self):
        key = os.getenv("OPENAI_API_KEY")
        if not key: raise ValueError("OPENAI_API_KEY not configured")
        self.client = OpenAI(api_key=key)
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")

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
        self.model_name = os.getenv("GOOGLE_MODEL", "gemini-2.5-flash")
        log.info("Initializing GoogleProvider with model: %s", self.model_name)
        self.model = genai.GenerativeModel(
            self.model_name,
            system_instruction=(
                "You are Scribe, an elite universal interview assistant and expert co-pilot embedded in a browser sidepanel. "
                "Your primary purpose is to help the user answer complex questions and solve problems across ANY domain (e.g., Software Engineering, Teaching, Government Exams, Finance, Law, etc.).\n\n"
                "CRITICAL Directives:\n"
                "1. Read the provided transcript context and any attached screenshots deeply to understand exactly what is being asked.\n"
                "2. Provide highly accurate, comprehensive, and well-thought-out answers. Do not make the answer so short that it loses critical nuance or context.\n"
                "3. If it is a coding question, provide the optimal working code with a Time/Space complexity breakdown.\n"
                "4. If it is a behavioral or scenario-based question (e.g., a teaching scenario or policy question), write out the ideal, comprehensive talking points the user should say in response.\n"
                "5. While you should be comprehensive, format your answer powerfully so the user can skim it while speaking. Use bolding for key terms, clear paragraphs, and bullet points where appropriate."
            )
        )

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
    def get_response(self, transcript=None, image_url=None, image_base64=None, image_array=None):
        parts = []
        if transcript: parts.append(transcript)
        
        if image_array:
            for b64 in image_array:
                parts.append(self._pil_from_base64(b64))
        elif image_base64: parts.append(self._pil_from_base64(image_base64))
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

db_error = None
try:
    import urllib.parse
    import ssl
    import pg8000.dbapi
    pg8000.dbapi.paramstyle = 'format'
except Exception as e:
    db_error = f"Import error: {e}"

def get_db_connection():
    global db_error
    if db_error: return None
    db_url = os.environ.get("POSTGRES_URL")
    if not db_url: return None
    try:
        parsed = urllib.parse.urlparse(db_url)
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return pg8000.dbapi.connect(
            user=parsed.username,
            password=parsed.password,
            host=parsed.hostname,
            database=parsed.path[1:],
            port=parsed.port or 5432,
            ssl_context=context
        )
    except Exception as e:
        db_error = f"Connect error: {e}"
        return None

# Initialize table
try:
    conn = get_db_connection()
    if conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scribe_sessions (
                id VARCHAR(255) PRIMARY KEY,
                title VARCHAR(255),
                transcript TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.close()
        conn.commit()
        conn.close()
except:
    pass

@app.get("/favicon.ico")
@app.get("/favicon.png")
def favicon():
    ico = os.path.join(os.path.dirname(__file__), "favicon.png")
    if os.path.exists(ico):
        return send_file(ico, mimetype="image/png")
    return "", 204

@app.get("/")
@app.get("/api")
@app.get("/api/")
@app.get("/api/index")
@app.get("/api/index.py")
def root():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Scribe | The Ultimate AI Interview Co-Pilot</title>
  <style>
    :root { --primary: #3b82f6; --bg-dark: #0f172a; --bg-card: #1e293b; --text-light: #f8fafc; --text-muted: #94a3b8; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    body { background-color: var(--bg-dark); color: var(--text-light); line-height: 1.6; min-height: 100vh; overflow-x: hidden; }
    .hero { text-align: center; padding: 100px 20px 60px; max-width: 900px; margin: 0 auto; }
    .badge { display: inline-flex; align-items: center; background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 6px 16px; border-radius: 9999px; font-weight: 600; font-size: 14px; margin-bottom: 30px; border: 1px solid rgba(59, 130, 246, 0.3); }
    .badge span { display: inline-block; width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; margin-right: 8px; box-shadow: 0 0 10px #3b82f6; animation: pulse 2s infinite; }
    h1 { font-size: clamp(3rem, 6vw, 4.5rem); font-weight: 800; letter-spacing: -0.04em; margin-bottom: 24px; line-height: 1.1; background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { font-size: clamp(1.1rem, 2vw, 1.4rem); color: var(--text-muted); margin-bottom: 48px; max-width: 650px; margin-left: auto; margin-right: auto; }
    .btn { display: inline-flex; align-items: center; gap: 8px; background: var(--primary); color: white; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; text-decoration: none; transition: all 0.2s; box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4); border: 1px solid rgba(255,255,255,0.1); }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 15px 35px -5px rgba(59, 130, 246, 0.5); }
    .btn-secondary { background: rgba(255, 255, 255, 0.05); color: white; box-shadow: none; }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); box-shadow: none; }
    .actions { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 80px; }
    
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; max-width: 1100px; margin: 0 auto; padding: 0 20px 100px; }
    .feature-card { background: var(--bg-card); border: 1px solid rgba(255,255,255,0.05); padding: 32px; border-radius: 20px; transition: transform 0.2s, border-color 0.2s; }
    .feature-card:hover { transform: translateY(-5px); border-color: rgba(59, 130, 246, 0.3); }
    .feature-icon { font-size: 32px; margin-bottom: 20px; display: inline-block; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 12px; }
    .feature-title { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #f1f5f9; }
    .feature-desc { color: var(--text-muted); line-height: 1.6; font-size: 15px; }

    @keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); } }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div class="hero">
    <div class="badge"><span></span> Scribe Intelligence API Active</div>
    <h1>The Ultimate Undercover<br>Interview Co-Pilot.</h1>
    <p class="subtitle">A stealth Chrome Extension that listens to your microphone, captures your screen, and uses AI to instantly solve LeetCode algorithms, handle behavioral questions, and pull up contextual knowledge in real-time.</p>
    <div class="actions">
      <a href="https://github.com/Shubh-Pandey99/scribe" target="_blank" class="btn">
        <svg fill="currentColor" width="20" height="20" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        View Source Code
      </a>
      <a href="https://portfolio-shubh-pandey99s-projects.vercel.app/" class="btn btn-secondary">
        Return to Portfolio
      </a>
    </div>
  </div>

  <div class="features">
    <div class="feature-card">
      <div class="feature-icon">👁️</div>
      <div class="feature-title">Stealth Mode UI</div>
      <div class="feature-desc">Engineered for high-pressure environments. Instantly blur transcripts, hide interface elements, and make the app look like a system panel. Reads only via precise mouse hover.</div>
    </div>
    <div class="feature-card">
      <div class="feature-icon">⚡</div>
      <div class="feature-title">Lightning Multimodal AI</div>
      <div class="feature-desc">Stitches continuous microphone audio streams with `Ctrl+V` visual screenshots to feed a contextually aware Gemini Flash + Groq Whisper brain that responds in under 3 seconds.</div>
    </div>
    <div class="feature-card">
      <div class="feature-icon">💻</div>
      <div class="feature-title">O(1) Interview Hacking</div>
      <div class="feature-desc">Strict system prompts force the AI to instantly drop fluff and prioritize raw Big-O optimal code snips and behavioral bullet points you can read instantly.</div>
    </div>
  </div>
</body>
</html>
    """, 200, {"Content-Type": "text/html"}

@app.get("/health")
def health(): return jsonify({"status":"ok", "db_error": db_error}), 200

# -------- Sessions API (Postgres) --------
@app.get("/api/sessions")
def get_sessions():
    conn = get_db_connection()
    if not conn: return jsonify({"error": f"No database attached. {db_error}"}), 503
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, title, transcript, created_at FROM scribe_sessions ORDER BY created_at DESC LIMIT 50")
        cols = [desc[0] for desc in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.close()
        
        # Convert datetime to string
        for r in rows:
            if r.get('created_at'): r['started_at'] = r['created_at'].isoformat()
        return jsonify(rows), 200
    except Exception as e:
        log.exception("get sessions failed")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.post("/api/sessions")
def save_session():
    data = request.get_json(force=True) or {}
    sid = data.get("id")
    title = data.get("title", "Untitled session")
    transcript = data.get("transcript", "")
    if not sid: return jsonify({"error": "Missing id"}), 400
    
    conn = get_db_connection()
    if not conn: return jsonify({"error": "No database attached"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO scribe_sessions (id, title, transcript) 
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET 
              title = EXCLUDED.title, 
              transcript = EXCLUDED.transcript
        """, (sid, title, transcript))
        cur.close()
        conn.commit()
        return jsonify({"status": "saved", "id": sid}), 200
    except Exception as e:
        log.exception("save session failed")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.delete("/api/sessions/<session_id>")
def delete_session(session_id):
    conn = get_db_connection()
    if not conn: return jsonify({"error": "No database attached"}), 503
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM scribe_sessions WHERE id = %s", (session_id,))
        cur.close()
        conn.commit()
        return jsonify({"status": "deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.post("/api/answer")
def answer():
    try:
        data = request.get_json(force=True) or {}
        provider_name = data.get("provider","google")
        transcript = data.get("transcript")
        image_url = data.get("imageUrl")
        image_base64 = data.get("imageBase64")
        image_array = data.get("imageArray")

        provider = get_provider(provider_name)
        result = provider.get_response(transcript=transcript, image_url=image_url, image_base64=image_base64, image_array=image_array)
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
        previous_text = data.get("previousText", "")
        if not audio_b64: return jsonify({"error":"No audioBase64"}), 400

        # decode to temp file
        if "," in audio_b64:
            header, encoded = audio_b64.split(",",1)
        else:
            encoded = audio_b64
        
        # Fix base64 padding (browsers sometimes omit trailing '=')
        encoded = encoded.strip()
        padding = 4 - len(encoded) % 4
        if padding != 4:
            encoded += '=' * padding
        
        buf = base64.b64decode(encoded)
        log.info("Received audio chunk: %d bytes, mime=%s", len(buf), mime)
        
        if len(buf) < 100:
            return jsonify({"text": "", "method": "skip", "debug": "chunk too small"}), 200
        
        suffix = ".webm" if "webm" in mime else ".ogg" if "ogg" in mime else ".wav" if "wav" in mime else ".mp4" if "mp4" in mime else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(buf)
            tmp_path = f.name

        text = ""
        method = "none"
        debug_info = ""
        
        # PRIMARY: Groq Whisper (free, fast, reliable)
        groq_key = os.getenv("GROQ_API_KEY")
        if groq_key:
            try:
                groq_client = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1")
                with open(tmp_path, "rb") as fp:
                    tr = groq_client.audio.transcriptions.create(model="whisper-large-v3-turbo", file=fp, prompt=previous_text)
                text = getattr(tr, "text", "").strip()
                method = "groq-whisper"
                debug_info = f"groq returned {len(text)} chars"
                log.info("Groq Whisper result: '%s'", text[:100])
            except Exception as e:
                err_str = str(e)
                debug_info = f"groq error: {err_str[:100]}"
                # If rate limited, set method so frontend shows what happened
                if "429" in err_str or "rate" in err_str.lower():
                    method = "groq-ratelimit"
                    log.warning("Groq rate limited, trying fallbacks")
                else:
                    log.warning("Groq failed: %s, trying OpenAI fallback", e)
        else:
            debug_info = "no GROQ_API_KEY"
        
        # Fallback 1: OpenAI Whisper
        if not text:
            oai_key = os.getenv("OPENAI_API_KEY")
            if oai_key:
                try:
                    client = OpenAI(api_key=oai_key)
                    with open(tmp_path, "rb") as fp:
                        tr = client.audio.transcriptions.create(model="whisper-1", file=fp, prompt=previous_text)
                    text = getattr(tr, "text", "").strip()
                    method = "whisper"
                    debug_info += f" | whisper returned {len(text)} chars"
                    log.info("Whisper result: '%s'", text[:100])
                except Exception as e:
                    debug_info += f" | whisper error: {str(e)[:100]}"
                    log.warning("Whisper failed: %s, trying Gemini fallback", e)
        
        # Fallback 2: Google Gemini for audio transcription (with retry for 429)
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
                prompt = (
                    "Transcribe this audio exactly. Output ONLY the spoken words, nothing else. "
                    "If there is music but no speech, output just the word MUSIC. If completely silent, output SILENT. "
                    f"Previous context for smooth stitching: '{previous_text[-200:]}'"
                )
                
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



if __name__ == "__main__":
    host = os.getenv("HOST","0.0.0.0")
    port = int(os.getenv("PORT",5055))
    debug = os.getenv("DEBUG","true").lower()=="true"
    log.info("Starting AnswerAI API on %s:%s (debug=%s)", host, port, debug)
    app.run(host=host, port=port, debug=debug)
