from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
import google.generativeai as genai
from PIL import Image
import requests
from io import BytesIO
import base64
import re

app = Flask(__name__)
CORS(app)

def is_valid_url(url):
    return re.match(r'^https?://', url)

def pil_to_base64(img):
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

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
        return jsonify({"error": "API key is required for the selected provider."}), 400
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
                # Correct GPT-4V usage: use `input` for image URL
                response = client.chat.completions.create(
                    model="gpt-4-vision-preview",
                    messages=[{"role": "user", "content": "Describe this image."}],
                    input=image_url,
                    max_tokens=300
                )
                return jsonify({"answer": response.choices[0].message.content})

        elif provider == 'openrouter':
            client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
            if transcript:
                response = client.chat.completions.create(
                    model="openai/gpt-3.5-turbo",
                    messages=[{"role": "user", "content": transcript}]
                )
                return jsonify({"answer": response.choices[0].message.content})
            else:
                return jsonify({"error": "OpenRouter provider does not support images."}), 400

        elif provider == 'google':
            genai.configure(api_key=api_key)
            if transcript:
                model = genai.GenerativeModel('gemini-pro')
                response = model.generate_content(transcript)
                return jsonify({"answer": response.text})
            elif image_url:
                # Download image and convert to base64 for Gemini Vision
                img_resp = requests.get(image_url)
                img = Image.open(BytesIO(img_resp.content))
                img_base64 = pil_to_base64(img)
                model = genai.GenerativeModel('gemini-pro-vision')
                response = model.generate_content(img_base64)
                return jsonify({"answer": response.text})

        else:
            return jsonify({"error": "Invalid provider specified."}), 400

    except Exception as e:
        print(f"Error calling {provider} API: {e}")
        return jsonify({"error": f"Failed to get response from {provider}.", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
