from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
import google.generativeai as genai
from PIL import Image
import requests
from io import BytesIO
import re

app = Flask(__name__)
CORS(app)

def is_valid_url(url):
    return re.match(r'^https?://', url)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return 'AI Meeting Assistant Python backend is running successfully!'

@app.route('/api/answer', methods=['POST'])
def get_answer():
    data = request.get_json()
    provider = data.get('provider')
    api_key = data.get('apiKey')
    transcript = data.get('transcript')
    image_url = data.get('imageUrl')

    if not provider:
        return jsonify({"error": "No provider specified."}), 400
    if not api_key and provider != 'mock':
        return jsonify({"error": "API key is required."}), 400
    if not transcript and not image_url:
        return jsonify({"error": "No transcript or image URL provided."}), 400
    if image_url and not is_valid_url(image_url):
        return jsonify({"error": "Invalid image URL provided."}), 400

    try:
        if provider == 'mock':
            return jsonify({"answer": "This is a mock response for testing."})

        elif provider == 'openai':
            client = OpenAI(api_key=api_key)
            if transcript:
                response = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": transcript}]
                )
                return jsonify({"answer": response.choices[0].message.content})
            elif image_url:
                response = client.chat.completions.create(
                    model="gpt-4-vision-preview",
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
            client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
            if transcript:
                response = client.chat.completions.create(
                    model="openai/gpt-3.5-turbo",
                    messages=[{"role": "user", "content": transcript}],
                )
                return jsonify({"answer": response.choices[0].message.content})
            else:
                return jsonify({"error": "OpenRouter provider does not support image analysis."}), 400

        elif provider == 'google':
            genai.configure(api_key=api_key)
            if transcript:
                model = genai.GenerativeModel('gemini-pro')
                response = model.generate_content(transcript)
                return jsonify({"answer": response.text})
            elif image_url:
                model = genai.GenerativeModel('gemini-pro-vision')
                response = requests.get(image_url)
                img = Image.open(BytesIO(response.content))
                response = model.generate_content(img)
                return jsonify({"answer": response.text})

        else:
            return jsonify({"error": "Invalid provider specified."}), 400

    except Exception as e:
        print(f"Error calling {provider} API: {e}")
        return jsonify({"error": f"Failed to get response from {provider}.", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
