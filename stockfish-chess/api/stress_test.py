import requests
import time
import argparse
import json

#python stress_test.py \
#  --url_base http://localhost:6000 \
#  --endpoint best_move \
#  --fen "r1bk2r1/ppq1n2p/4pQ2/PB1p1p2/P1n2P1N/2p5/2P3PP/R1B2RK1 w - - 0 19" \
#  --depth 20 \
#  --iterations 200 \
#  --delay 0.2

#python stress_test.py \
#  --url_base http://localhost:6000 \
#  --endpoint evaluate_move \
#  --fen "r1bk2r1/ppq1n2p/4pQ2/PB1p1p2/P1n2P1N/2p5/2P3PP/R1B2RK1 w - - 0 19" \
#  --move "a1a3" \
#  --depth 20 \
#  --iterations 200 \
#  --delay 0.2

def run_stress_test(url_base, endpoint, fen, move, depth, iterations, delay):
    """
    Runs a stress test against the specified Stockfish API endpoint.

    Args:
        url_base (str): The base URL of the API (e.g., http://localhost/stockfish-chess/api)
        endpoint (str): The API endpoint to test ('best_move' or 'evaluate_move')
        fen (str): The FEN string for the position (or 'startpos').
        move (str, optional): The move to evaluate (for 'evaluate_move' endpoint).
        depth (int): The search depth for Stockfish.
        iterations (int): The number of requests to send.
        delay (float): The delay in seconds between requests.
    """
    if not url_base.endswith('/'):
        url_base += '/'
    target_url = url_base + endpoint

    print(f"Starting stress test on: {target_url}")
    print(f"Parameters: FEN='{fen}', Move='{move}', Depth={depth}, Iterations={iterations}, Delay={delay}s\n")

    payload = {
        "fen": fen if fen.lower() != "startpos" else "startpos", # API expects "startpos" literal
        "depth": depth
    }

    if endpoint == "evaluate_move":
        if not move:
            print("Error: Move is required for 'evaluate_move' endpoint.")
            return
        payload["move"] = move

    response_times = []
    error_count = 0

    for i in range(iterations):
        print(f"Request {i + 1}/{iterations}...")
        try:
            start_time = time.time()
            response = requests.post(target_url, json=payload, timeout=120) # Increased timeout for Stockfish
            end_time = time.time()

            duration = end_time - start_time
            response_times.append(duration)

            print(f"  Status Code: {response.status_code}")
            print(f"  Time Taken: {duration:.4f} seconds")

            if response.status_code == 200:
                try:
                    response_data = response.json()
                    if endpoint == "best_move":
                        print(f"  Best Move: {response_data.get('best_move')}, Score: {response_data.get('score')}{response_data.get('score_type')}")
                    elif endpoint == "evaluate_move":
                        print(f"  Candidate: {response_data.get('candidate_move')}, Relative Eval: {response_data.get('relative_evaluation', {}).get('difference')}")
                except json.JSONDecodeError:
                    print(f"  Response: {response.text[:100]}... (Not valid JSON)")
            else:
                print(f"  Error Response: {response.text[:200]}...")
                error_count += 1

        except requests.exceptions.Timeout:
            print("  Error: Request timed out.")
            response_times.append(float('inf')) # Represent timeout
            error_count += 1
        except requests.exceptions.RequestException as e:
            print(f"  Error: Request failed: {e}")
            response_times.append(float('inf')) # Represent failure
            error_count += 1
        
        if i < iterations - 1 and delay > 0:
            time.sleep(delay)
        print("-" * 30)

    print("\nStress Test Summary:")
    if response_times:
        valid_times = [t for t in response_times if t != float('inf')]
        if valid_times:
            print(f"  Min Response Time: {min(valid_times):.4f} seconds")
            print(f"  Max Response Time: {max(valid_times):.4f} seconds")
            print(f"  Avg Response Time: {sum(valid_times) / len(valid_times):.4f} seconds")
        else:
            print("  No successful responses to calculate time statistics.")
        total_successful = iterations - error_count
        print(f"  Total Requests: {iterations}")
        print(f"  Successful Requests: {total_successful} ({ (total_successful / iterations) * 100 :.2f}%)")
        print(f"  Failed/Timed Out Requests: {error_count}")
    else:
        print("  No requests were made.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stress test Stockfish API.")
    parser.add_argument("--url_base", type=str, required=True,
                        help="Base URL of the API (e.g., http://localhost/stockfish-chess/api)")
    parser.add_argument("--endpoint", type=str, choices=["best_move", "evaluate_move"], required=True,
                        help="API endpoint to test.")
    parser.add_argument("--fen", type=str, default="startpos",
                        help="FEN string for the position, or 'startpos'.")
    parser.add_argument("--move", type=str, default="e2e4",
                        help="Move to evaluate (for 'evaluate_move' endpoint).")
    parser.add_argument("--depth", type=int, default=15,
                        help="Search depth for Stockfish.")
    parser.add_argument("--iterations", type=int, default=10,
                        help="Number of requests to send.")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Delay in seconds between requests.")

    args = parser.parse_args()

    run_stress_test(args.url_base, args.endpoint, args.fen, args.move, args.depth, args.iterations, args.delay)
