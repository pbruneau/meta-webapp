document.addEventListener('DOMContentLoaded', function() {
    const fenInput = document.getElementById('fen');
    const moveInput = document.getElementById('move');
    const evalPositionBtn = document.getElementById('evalPosition');
    const evalMoveBtn = document.getElementById('evalMove');
    const resultDiv = document.getElementById('result');
    
    // Use the proxied API endpoints
    const apiBaseUrl = '/stockfish-chess/api';
    
    // Default FEN for starting position
    const startPos = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    
    // Extract side to move from FEN string
    function getSideToMove(fen) {
        if (fen === startPos || !fen) return 'w';
        const parts = fen.split(' ');
        return parts.length > 1 ? parts[1] : 'w';
    }
    
    // Event listener for Evaluate Position button
    evalPositionBtn.addEventListener('click', function() {
        const fen = fenInput.value.trim() || startPos;
        evaluatePosition(fen);
    });
    
    // Event listener for Evaluate Move button
    evalMoveBtn.addEventListener('click', function() {
        const fen = fenInput.value.trim() || startPos;
        const move = moveInput.value.trim();
        
        if (!move) {
            resultDiv.innerHTML = "Please enter a move to evaluate";
            return;
        }
        
        evaluateMove(fen, move);
    });
    
    // Function to evaluate a position
    function evaluatePosition(fen) {
        resultDiv.innerHTML = "<div class='loading'>Analyzing position...</div>";
        const sideToMove = getSideToMove(fen);
        
        fetch(`${apiBaseUrl}/best_move`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fen: fen === startPos ? "startpos" : fen,
                depth: 20
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Use the side_to_move from API response if available, otherwise use extracted value
            const actualSideToMove = data.side_to_move || sideToMove;
            
            let resultText = `<strong>Best move:</strong> ${formatMove(data.best_move)}`;
            
            if (data.ponder) {
                resultText += `<br><strong>Ponder:</strong> ${formatMove(data.ponder)}`;
            }
            
            if (data.score_type && data.score !== null) {
                resultText += `<br><strong>Evaluation:</strong> ${formatScore(data.score, data.score_type, actualSideToMove)}`;
            }
                        
            resultDiv.innerHTML = resultText;
        })
        .catch(error => {
            resultDiv.innerHTML = `Error: ${error.message}`;
            console.error('Error:', error);
        });
    }
    
    // Function to evaluate a move
    function evaluateMove(fen, move) {
        resultDiv.innerHTML = "<div class='loading'>Analyzing move...</div>";
        
        fetch(`${apiBaseUrl}/evaluate_move`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fen: fen === startPos ? "startpos" : fen,
                move: move,
                depth: 20
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            let resultText = `<strong>Candidate move:</strong> ${formatMove(data.candidate_move)}<br>`;
            // Masking best move in Eval mode
            //resultText += `<strong>Best move:</strong> ${formatMove(data.best_move)}`;
            
            //if (data.ponder) {
            //    resultText += ` (expecting ${formatMove(data.ponder)})`;
            //}
            //resultText += `<br>`;
            
            if (data.best_move_score_type && data.best_move_score !== null) {
                resultText += `<strong>Best move score:</strong> ${formatScore(
                    data.best_move_score, 
                    data.best_move_score_type, 
                    data.side_to_move
                )}<br>`;
            }
            
            // Add expected reply information
            if (data.expected_reply) {
                resultText += `<strong>Expected reply:</strong> ${formatMove(data.expected_reply)}`;
                
                if (data.expected_reply_ponder) {
                    resultText += ` (leading to ${formatMove(data.expected_reply_ponder)})`;
                }
                resultText += `<br>`;
            }
            
            if (data.relative_evaluation) {
                const eval = data.relative_evaluation;
                const evaluationClass = eval.is_worse ? 'evaluation-worse' : 'evaluation-better';
                
                resultText += `<strong>Evaluation:</strong> <span class="${evaluationClass}">`;
                
                if (eval.type === "centipawn difference") {
                    resultText += `${eval.difference > 0 ? '+' : ''}${eval.difference} centipawns `;
                    resultText += eval.is_worse ? 'worse' : 'better';
                } else {
                    resultText += eval.difference;
                }
                
                resultText += `</span><br>`;
                
                // Add score after move
                if (data.analysis_after_move && 
                    data.analysis_after_move.score !== null && 
                    data.analysis_after_move.score_type) {
                    
                    // Get opposite side for the analysis after move
                    const sideAfterMove = data.side_to_move === 'w' ? 'b' : 'w';

                    // 2. keep a constant White-is-positive convention for CP,
                    //    but leave mate numbers untouched
                    const scoreForDisplay =
                        data.analysis_after_move.score_type === 'cp'
                            ? -data.analysis_after_move.score   // flip once
                            :  data.analysis_after_move.score;  // no change

                    resultText += `<strong>Position score after move:</strong> ${formatScore(
                        scoreForDisplay, 
                        data.analysis_after_move.score_type,
                        sideAfterMove
                    )}`;
                }
            }
            
            resultDiv.innerHTML = resultText;
        })
        .catch(error => {
            resultDiv.innerHTML = `Error: ${error.message}`;
            console.error('Error:', error);
        });
    }

    // Helper function to format chess move notation
    function formatMove(move) {
        if (!move) return "none";
        
        // If move is already in algebraic notation, return as is
        if (move.length < 4) return move;
        
        // Convert from e2e4 format to more readable format
        const from = move.substring(0, 2);
        const to = move.substring(2, 4);
        const promotion = move.length > 4 ? move.substring(4) : '';
        
        return `${from}-${to}${promotion ? '=' + promotion.toUpperCase() : ''}`;
    }
    
    // Format score for display
    function formatScore(score, scoreType, sideToMove = 'w') {
        if (scoreType === "cp") {
            const scoreNum = parseInt(score);
            return `${scoreNum > 0 ? '+' : ''}${scoreNum / 100} pawns`;
        } else if (scoreType === "mate") {
            // If score is positive, the side to move has mate
            // If negative, the side to move is getting mated
            const isPositive = parseInt(score) > 0;
            const matingPlayer = (isPositive ? sideToMove : (sideToMove === 'w' ? 'b' : 'w'));
            return `Mate in ${Math.abs(score)} for ${matingPlayer === 'w' ? 'white' : 'black'}`;
        }
        return score;
    }
});
