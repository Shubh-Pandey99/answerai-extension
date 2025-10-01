from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from openai import OpenAI
import google.generativeai as genai
from PIL import Image
import requests
from io import BytesIO
import re
import os
import json
import time
import logging
from abc import ABC, abstractmethod
from dotenv import load_dotenv
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
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        logger.error(f"Final attempt failed for {func.__name__}: {e}")
                        raise e
                    
                    delay = base_delay * (2 ** attempt)
                    logger.warning(f"Attempt {attempt + 1} failed for {func.__name__}: {e}. Retrying in {delay}s...")
                    time.sleep(delay)
            return None
        return wrapper
    return decorator

# --- Provider Abstraction ---

class BaseProvider(ABC):
    @abstractmethod
    def get_response(self, transcript, image_url=None):
        pass

    @abstractmethod
    def stream_response(self, transcript):
        pass

class OpenAIProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.environ.get('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not configured")
        self.client = OpenAI(api_key=self.api_key)
        self.model = "gpt-4o"

    @retry_with_backoff()
    def get_response(self, transcript, image_url=None):
        if transcript:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": transcript}]
            )
            return {"answer": response.choices[0].message.content}
        elif image_url:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze this image..."},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }]
            )
            return {"answer": response.choices[0].message.content}
        return {"error": "No input provided"}

    def stream_response(self, transcript):
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": transcript}],
                stream=True
            )
            for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"data: {json.dumps({'chunk': content, 'completed': False})}\n\n"
            yield f"data: {json.dumps({'completed': True})}\n\n"
        except GeneratorExit:
            logger.info("Client disconnected from stream.")
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Streaming failed: {str(e)}'})}\n\n"

class GoogleProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.environ.get('GOOGLE_API_KEY')
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not configured")
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel('gemini-pro-vision')

    @retry_with_backoff()
    def get_response(self, transcript, image_url=None):
        if transcript and image_url:
            image_response = requests.get(image_url)
            image_parts = [
                {"mime_type": "image/jpeg", "data": image_response.content}
            ]
            response = self.model.generate_content([transcript, image_parts])
            return {"answer": response.text}
        elif transcript:
            response = self.model.generate_content(transcript)
            return {"answer": response.text}
        elif image_url:
            image_response = requests.get(image_url)
            image_parts = [
                {"mime_type": "image/jpeg", "data": image_response.content}
            ]
            response = self.model.generate_content(image_parts)
            return {"answer": response.text}
        return {"error": "No input provided"}

    def stream_response(self, transcript):
        yield f"data: {json.dumps({'error': 'Streaming not supported for Google provider yet.'})}\n\n"

class MockProvider(BaseProvider):
    def get_response(self, transcript, image_url=None):
        return {"answer": "Mock response: analysis complete."}
    def stream_response(self, transcript):
        for word in ["This", "is", "a", "mock", "stream."]:
            yield f"data: {json.dumps({'chunk': word + ' ', 'completed': False})}\n\n"
            time.sleep(0.2)
        yield f"data: {json.dumps({'completed': True})}\n\n"

PROVIDERS = {
    "openai": OpenAIProvider,
    "google": GoogleProvider,
    "mock": MockProvider,
}

def get_provider(provider_name: str) -> BaseProvider:
    ProviderClass = PROVIDERS.get(provider_name)
    if not ProviderClass:
        raise ValueError("Invalid provider specified")
    try:
        return ProviderClass()
    except ValueError as e:
        # Handle missing API key
        raise ValueError(f"Failed to initialize provider '{provider_name}': {e}")


app = Flask(__name__)
CORS(app)

@app.route('/api/answer', methods=['POST'])
def get_answer():
    data = request.get_json()
    provider_name = data.get('provider', 'openai')
    transcript = data.get('transcript')
    image_url = data.get('imageUrl')

    if not transcript and not image_url:
        return jsonify({"error": "No transcript or image URL provided."}), 400

    try:
        provider = get_provider(provider_name)
        result = provider.get_response(transcript, image_url)
        if "error" in result:
            return jsonify(result), 500
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Error with provider {provider_name}: {e}")
        return jsonify({"error": "An unexpected error occurred."}), 500

@app.route('/api/stream', methods=['POST'])
def stream_response():
    data = request.get_json()
    provider_name = data.get('provider', 'openai')
    transcript = data.get('transcript')

    if not transcript:
        return jsonify({"error": "No transcript provided."}), 400

    try:
        provider = get_provider(provider_name)
        return Response(provider.stream_response(transcript), mimetype='text/event-stream')
    except ValueError as e:
        # Cannot return a JSON error in a stream, so we handle it this way
        def error_stream():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream')

def check_openai_connectivity():
    try:
        provider = OpenAIProvider()
        provider.client.models.list()
        return "ok"
    except Exception as e:
        logger.error(f"OpenAI connectivity check failed: {e}")
        return "error"

@app.route('/api/health', methods=['GET'])
def health_check():
    openai_status = check_openai_connectivity()
    return jsonify({
        "status": "healthy",
        "version": "2.1.0",
        "dependencies": {
            "openai": openai_status
        }
    })

if __name__ == '__main__':
    app.run(debug=True)
