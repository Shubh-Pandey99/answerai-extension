from flask import Flask, request, jsonify, Response, stream_template_string
from flask_cors import CORS
from openai import OpenAI
import google.generativeai as genai
from PIL import Image
import requests
from io import BytesIO
import re
import os
import asyncio
import json
import time
import logging
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from functools import wraps

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def retry_with_backoff(max_retries=3, base_delay=1):
    """Decorator for automatic retry with exponential backoff"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        logger.error(f"Final attempt failed for {func.__name__}: {e}")
                        raise e
                    
                    delay = base_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(f"Attempt {attempt + 1} failed for {func.__name__}: {e}. Retrying in {delay}s...")
                    await asyncio.sleep(delay)
            return None
        return wrapper
    return decorator

app = Flask(__name__)
CORS(app)

def is_valid_url(url):
    return re.match(r'^https?://', url)

async def get_emergent_response(transcript, image_url=None, use_gpt5=False):
    """Enhanced AI response using Emergent integrations with GPT-5 support"""
    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        if not emergent_key:
            return {"error": "Emergent LLM key not configured"}
        
        # Initialize LlmChat with GPT-5 or GPT-4o
        model = "gpt-5" if use_gpt5 else "gpt-4o"
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"meeting_assistant_{hash(transcript or image_url or 'session')}",
            system_message="You are an AI meeting assistant. Provide helpful, concise, and accurate responses to questions about meetings, transcripts, and images. Format your responses clearly and professionally."
        ).with_model("openai", model)
        
        # Handle text input
        if transcript:
            user_message = UserMessage(text=transcript)
            response = await chat.send_message(user_message)
            return {"answer": response}
        
        # Handle image analysis (fallback to OpenAI for now)
        elif image_url:
            client = OpenAI(api_key=emergent_key)
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze this image and describe what you see. If it's a meeting screenshot, identify key points, text, or visual elements."},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }]
            )
            return {"answer": response.choices[0].message.content}
            
        return {"error": "No input provided"}
        
    except Exception as e:
        print(f"Error with Emergent integration: {e}")
        return {"error": f"Emergent AI processing failed: {str(e)}"}

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return 'AI Meeting Assistant Python backend is running successfully!'

@app.route('/api/answer', methods=['POST'])
def get_answer():
    data = request.get_json()
    provider = data.get('provider', 'emergent')  # Default to emergent
    api_key = data.get('apiKey')
    transcript = data.get('transcript')
    image_url = data.get('imageUrl')
    use_gpt5 = data.get('useGPT5', True)  # Default to GPT-5
    
    if not transcript and not image_url:
        return jsonify({"error": "No transcript or image URL provided."}), 400
    if image_url and not is_valid_url(image_url):
        return jsonify({"error": "Invalid image URL provided."}), 400

    try:
        # Enhanced Emergent provider (Primary)
        if provider in ['emergent', 'gpt5', 'openai-emergent']:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(get_emergent_response(transcript, image_url, use_gpt5))
            loop.close()
            if "error" in result:
                return jsonify(result), 500
            return jsonify(result)
            
        # Mock provider
        elif provider == 'mock':
            return jsonify({"answer": "Enhanced mock response with GPT-5 simulation - meeting analysis complete."})

        # Legacy OpenAI provider
        elif provider == 'openai':
            if not api_key:
                return jsonify({"error": "API key is required for OpenAI provider."}), 400
                
            client = OpenAI(api_key=api_key)
            if transcript:
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "user", "content": transcript}]
                )
                return jsonify({"answer": response.choices[0].message.content})
            elif image_url:
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "What’s in this image?"},
                            {"type": "image_url", "image_url": {"url": image_url}},
                        ],
                    }]
                )
                return jsonify({"answer": response.choices[0].message.content})

        elif provider == 'openrouter':
            if not api_key:
                return jsonify({"error": "API key is required for OpenRouter provider."}), 400
                
            client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
            if transcript:
                response = client.chat.completions.create(
                    model="openai/gpt-4o",
                    messages=[{"role": "user", "content": transcript}],
                )
                return jsonify({"answer": response.choices[0].message.content})
            else:
                return jsonify({"error": "OpenRouter provider does not support image analysis."}), 400

        elif provider == 'google':
            if not api_key:
                return jsonify({"error": "API key is required for Google provider."}), 400
                
            genai.configure(api_key=api_key)
            if transcript:
                model = genai.GenerativeModel('gemini-2.0-flash')
                response = model.generate_content(transcript)
                return jsonify({"answer": response.text})
            elif image_url:
                model = genai.GenerativeModel('gemini-2.0-flash')
                response = requests.get(image_url)
                img = Image.open(BytesIO(response.content))
                response = model.generate_content(img)
                return jsonify({"answer": response.text})

        else:
            return jsonify({"error": "Invalid provider specified. Use 'emergent', 'openai', 'google', 'openrouter', or 'mock'."}), 400

    except Exception as e:
        print(f"Error calling {provider} API: {e}")
        return jsonify({"error": f"Failed to get response from {provider}.", "details": str(e)}), 500

@app.route('/api/stream', methods=['POST'])
def stream_response():
    """Streaming endpoint for real-time AI responses"""
    data = request.get_json()
    provider = data.get('provider', 'emergent')
    transcript = data.get('transcript')
    use_gpt5 = data.get('useGPT5', True)
    
    if not transcript:
        return jsonify({"error": "No transcript provided."}), 400
    
    def generate_stream():
        try:
            emergent_key = os.environ.get('EMERGENT_LLM_KEY')
            if not emergent_key:
                yield f"data: {json.dumps({'error': 'Emergent LLM key not configured'})}\n\n"
                return
                
            # Simulate streaming by chunking response (real streaming would require WebSocket)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            model = "gpt-5" if use_gpt5 else "gpt-4o" 
            chat = LlmChat(
                api_key=emergent_key,
                session_id=f"stream_session_{hash(transcript)}",
                system_message="You are an AI meeting assistant. Provide helpful responses in real-time."
            ).with_model("openai", model)
            
            user_message = UserMessage(text=transcript)
            response = loop.run_until_complete(chat.send_message(user_message))
            loop.close()
            
            # Chunk the response for streaming effect
            words = response.split()
            current_chunk = ""
            
            for i, word in enumerate(words):
                current_chunk += word + " "
                if i % 3 == 0 or i == len(words) - 1:  # Send every 3 words
                    yield f"data: {json.dumps({'chunk': current_chunk.strip(), 'completed': i == len(words) - 1})}\n\n"
                    current_chunk = ""
                    
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Streaming failed: {str(e)}'})}\n\n"
    
    return Response(generate_stream(), mimetype='text/plain')

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint with enhanced status"""
    return jsonify({
        "status": "healthy",
        "service": "AI Meeting Assistant Enhanced Backend",
        "version": "2.0.0",
        "features": ["GPT-5", "Streaming", "Multi-Provider", "Enhanced Audio Processing"],
        "emergent_integration": "enabled" if os.environ.get('EMERGENT_LLM_KEY') else "disabled"
    })

if __name__ == '__main__':
    app.run(debug=True)
