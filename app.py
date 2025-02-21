from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__, template_folder='templates')
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "Access-Control-Allow-Origin", "Accept"],
        "expose_headers": ["Content-Type", "Authorization"]
    }
})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/proxy-download', methods=['POST'])
def proxy_download():
    try:
        data = request.get_json()
        url = data.get('url')
        if not url:
            return jsonify({"error": "No URL provided"}), 400

        response = requests.get(url)
        if response.status_code == 200:
            return jsonify({
                "success": True,
                "data": response.content.decode('utf-8') if response.headers.get('content-type', '').startswith('text/') else response.content.hex(),
                "contentType": response.headers.get('content-type', 'application/octet-stream')
            })
        else:
            return jsonify({"error": f"Failed to download: {response.status_code}"}), response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)