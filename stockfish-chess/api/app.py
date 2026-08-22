import subprocess
import re
import threading
import time
import os
import signal
from flask import Flask, request, jsonify
from flask_cors import CORS # type: ignore

app = Flask(__name__)
CORS(app)

class StockfishEngine:
    def __init__(self, stockfish_path='./stockfish'):
        self.stockfish_path = stockfish_path
        self.process = None
        self.lock = threading.Lock()
        self.start_engine()
    
    def start_engine(self):
        try:
            self.process = subprocess.Popen(
                self.stockfish_path,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Initialize UCI mode
            self._send_command("uci")
            self._wait_for("uciok")
            
            # Set some default options
            self._send_command("setoption name Hash value 128")
            self._send_command("setoption name Threads value 4")
            return True
        except Exception as e:
            print(f"Error starting Stockfish: {e}")
            return False
    
    def _send_command(self, command):
        if not self.process or self.process.poll() is not None:
            if not self.start_engine():
                raise Exception("Could not restart Stockfish engine")
        
        try:
            self.process.stdin.write(f"{command}\n")
            self.process.stdin.flush()
        except Exception as e:
            print(f"Error sending command to Stockfish: {e}")
            self.start_engine()  # Try to restart the engine
            raise
    
    def _wait_for(self, target_text, timeout=10):
        start_time = time.time()
        while True:
            if self.process.poll() is not None:
                raise Exception("Stockfish process has terminated")
            
            line = self.process.stdout.readline().strip()
            if target_text in line:
                return line
            
            if time.time() - start_time > timeout:
                raise TimeoutError(f"Timeout waiting for '{target_text}' from Stockfish")
    
    def _read_until_bestmove(self, timeout=60):
        lines = []
        info_line = ""
        start_time = time.time()
        
        while True:
            if self.process.poll() is not None:
                raise Exception("Stockfish process has terminated")
            
            line = self.process.stdout.readline().strip()
            lines.append(line)
            
            if line.startswith("info") and "score" in line:
                info_line = line
            
            if line.startswith("bestmove"):
                break
            
            if time.time() - start_time > timeout:
                # If we timeout, send a "stop" command and wait for bestmove
                self._send_command("stop")
                while True:
                    line = self.process.stdout.readline().strip()
                    lines.append(line)
                    if line.startswith("bestmove"):
                        break
                break
        
        return lines, info_line
    
    def _get_side_to_move(self, fen):
        # If fen is "startpos", white is to move
        if fen == "startpos":
            return "w"
        
        # Split the FEN string by spaces and get the side to move
        parts = fen.split()
        if len(parts) >= 2:
            return parts[1]  # The second part of FEN indicates side to move
        
        # Default to white if we can't determine
        return "w"
    
    def analyze_position(self, fen="startpos", depth=15):
        with self.lock:  # Ensure thread safety
            try:
                self._send_command("ucinewgame")
                self._send_command("isready")
                self._wait_for("readyok")

                # Get side to move from FEN
                side_to_move = self._get_side_to_move(fen)
                
                if fen == "startpos":
                    self._send_command(f"position startpos")
                else:
                    self._send_command(f"position fen {fen}")
                
                self._send_command(f"go depth {depth}")
                lines, last_info = self._read_until_bestmove()
                
                # Parse the output
                result = self._parse_analysis(lines, last_info)
                result["side_to_move"] = side_to_move  # Add this to the result
                
                return result
            except Exception as e:
                print(f"Error during position analysis: {e}")
    
    def evaluate_move(self, fen, move, depth=15):
        with self.lock:
            try:
                self._send_command("ucinewgame")
                self._send_command("isready")
                self._wait_for("readyok")

                # Get side to move from FEN
                side_to_move = self._get_side_to_move(fen)
                
                # First, analyze the current position to get the best move
                if fen == "startpos":
                    self._send_command(f"position startpos")
                else:
                    self._send_command(f"position fen {fen}")
                
                self._send_command(f"go depth {depth}")
                lines, last_info = self._read_until_bestmove()
                original_analysis = self._parse_analysis(lines, last_info)
                original_analysis["side_to_move"] = side_to_move
                
                # Now, make the candidate move and analyze the new position
                # After the move, the side to move changes
                opposite_side = "b" if side_to_move == "w" else "w"
                
                if fen == "startpos":
                    self._send_command(f"position startpos moves {move}")
                else:
                    self._send_command(f"position fen {fen} moves {move}")
                
                self._send_command(f"go depth {depth}")
                lines, last_info = self._read_until_bestmove()
                new_position_analysis = self._parse_analysis(lines, last_info)
                new_position_analysis["side_to_move"] = opposite_side
                
                # Calculate the relative evaluation from the perspective of the original side to move
                evaluation = self._calculate_relative_evaluation(original_analysis, new_position_analysis)
                
                return {
                    "best_move": original_analysis["best_move"],
                    "best_move_score": original_analysis["score"],
                    "best_move_score_type": original_analysis["score_type"],
                    "ponder": original_analysis["ponder"],  # Add ponder from original analysis
                    "side_to_move": side_to_move,
                    "candidate_move": move,
                    "relative_evaluation": evaluation,
                    "analysis_after_move": new_position_analysis,
                    "expected_reply": new_position_analysis["best_move"],  # Add opponent's expected best reply
                    "expected_reply_ponder": new_position_analysis["ponder"]  # Add ponder after the expected reply
                }
            except Exception as e:
                print(f"Error during move evaluation: {e}")
            
    def _parse_analysis(self, lines, last_info):
        result = {
            "best_move": None,
            "ponder": None,
            "score": None,
            "score_type": None,
            "depth": None,
            "nodes": None,
            "time": None,
            "principal_variation": []
        }
        
        # Parse the best move line
        for line in lines:
            if line.startswith("bestmove"):
                parts = line.split()
                result["best_move"] = parts[1]
                if len(parts) > 3 and parts[2] == "ponder":
                    result["ponder"] = parts[3]
            
            # Get the PV (principal variation)
            if "pv" in line:
                pv_match = re.search(r"pv ([\w\s]+)", line)
                if pv_match:
                    pv = pv_match.group(1).strip().split()
                    result["principal_variation"] = pv
        
        # Parse the info line for score and statistics
        if last_info:
            # Extract score
            score_match = re.search(r"score (cp|mate) ([-\d]+)", last_info)
            if score_match:
                result["score_type"] = score_match.group(1)
                result["score"] = int(score_match.group(2))
            
            # Extract depth
            depth_match = re.search(r"depth (\d+)", last_info)
            if depth_match:
                result["depth"] = int(depth_match.group(1))
            
            # Extract nodes
            nodes_match = re.search(r"nodes (\d+)", last_info)
            if nodes_match:
                result["nodes"] = int(nodes_match.group(1))
            
            # Extract time
            time_match = re.search(r"time (\d+)", last_info)
            if time_match:
                result["time"] = int(time_match.group(1))
        
        return result
    
    def _calculate_relative_evaluation(self, original, new_position):
        # In UCI protocol, scores are from the perspective of the side to move
        # We need to adjust the new position score to be from the perspective of the original side to move
        
        # If sides to move are different, negate the new position score to get consistent perspective
        if original["side_to_move"] != new_position["side_to_move"]:
            new_score = -new_position["score"]
        else:
            new_score = new_position["score"]
        
        # For mate scores, we need special handling
        if original["score_type"] == "mate" and new_position["score_type"] == "mate":
            original_mate = original["score"]
            new_mate = new_score  # Already adjusted for perspective
            
            if original_mate > 0 and new_mate > 0:
                # Both lead to side to move winning with mate, lower is better
                is_worse = original_mate < new_mate
                difference = new_mate - original_mate
            elif original_mate > 0 and new_mate < 0:
                # Was winning with mate, now being mated
                is_worse = True
                difference = "lost winning mate"
            elif original_mate < 0 and new_mate > 0:
                # Was being mated, now winning with mate
                is_worse = False
                difference = "found saving mate"
            else:  # original_mate < 0 and new_mate < 0
                # Both lead to being mated, higher is better (delays mate)
                is_worse = original_mate > new_mate
                difference = new_mate - original_mate
                
            return {
                "is_worse": is_worse,
                "difference": difference,
                "type": "mate comparison"
            }
        elif original["score_type"] == "mate":
            # Original has mate, new doesn't
            if original["score"] > 0:
                # Was winning with mate, now not mate
                return {
                    "is_worse": True,
                    "difference": f"Lost mate in {original['score']} for centipawn score {new_score}",
                    "type": "mate to centipawns"
                }
            else:
                # Was being mated, now not
                return {
                    "is_worse": False,
                    "difference": f"Avoided mate in {-original['score']} for centipawn score {new_score}",
                    "type": "mate to centipawns"
                }
        elif new_position["score_type"] == "mate":
            # New has mate, original doesn't
            if new_score > 0:
                # New move leads to mate for us
                return {
                    "is_worse": False,
                    "difference": f"Found mate in {new_score} from centipawn score {original['score']}",
                    "type": "centipawns to mate"
                }
            else:
                # New move leads to being mated
                return {
                    "is_worse": True,
                    "difference": f"Now being mated in {-new_score} from centipawn score {original['score']}",
                    "type": "centipawns to mate"
                }
        else:
            # Both are centipawn scores
            # Calculate difference - higher score is always better from the perspective of the side to move
            cp_difference = new_score - original["score"]
            return {
                "is_worse": cp_difference < 0,
                "difference": cp_difference,
                "type": "centipawn difference"
            }
    
    def cleanup(self):
        if self.process:
            try:
                self._send_command("quit")
                self.process.wait(timeout=2)
            except:
                # If quit doesn't work, force terminate
                if self.process.poll() is None:
                    os.kill(self.process.pid, signal.SIGTERM)
                    try:
                        self.process.wait(timeout=2)
                    except:
                        # If still running, use SIGKILL
                        if self.process.poll() is None:
                            os.kill(self.process.pid, signal.SIGKILL)

# Initialize the Stockfish engine
stockfish = StockfishEngine()

@app.route('/best_move', methods=['POST'])
def best_move():
    data = request.json
    fen = data.get('fen', 'startpos')
    depth = data.get('depth', 15)
    
    try:
        analysis = stockfish.analyze_position(fen, depth)
        result = {
            "best_move": analysis["best_move"],
            "ponder": analysis["ponder"],
            "score": analysis["score"],
            "score_type": analysis["score_type"],
            "principal_variation": analysis["principal_variation"]
        }
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/evaluate_move', methods=['POST'])
def evaluate_move():
    data = request.json
    fen = data.get('fen', 'startpos')
    move = data.get('move')
    depth = data.get('depth', 15)
    
    if not move:
        return jsonify({"error": "Move parameter is required"}), 400
    
    try:
        evaluation = stockfish.evaluate_move(fen, move, depth)
        return jsonify(evaluation)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.teardown_appcontext
def shutdown_engine(exception=None):
    stockfish.cleanup()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=6000)
    