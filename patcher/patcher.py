from flask import Flask, jsonify
import subprocess
import os

app = Flask(__name__)

TARGET_DIR = '/share'

@app.route('/run-patch', methods=['GET'])
def run_chmod_patch():
    """
    Finds all files in TARGET_DIR and applies 'chmod 644' to them.
    """
    if not os.path.isdir(TARGET_DIR):
        return jsonify({"status": "error", "message": f"Target directory {TARGET_DIR} not found inside the container."}), 500

    try:
        command = ["find", TARGET_DIR, "-type", "f", "-exec", "chmod", "644", "{}", "+"]
        
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        
        return jsonify({
            "status": "success",
            "message": "Permissions for all files in public_share have been set to 644."
        })

    except subprocess.CalledProcessError as e:
        return jsonify({
            "status": "error", 
            "message": "An error occurred while running the chmod command.",
            "stderr": e.stderr
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7000)