import React, { useState, useEffect } from 'react';
import './App.css';

// SVG-based piece definitions for consistent rendering across platforms
const pieceSvgs = {
  wP: `<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  wR: `<svg viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none" stroke-linejoin="miter"/></g></svg>`,
  wN: `<svg viewBox="0 0 45 45"><g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#fff"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#000" stroke="#000"/><path d="M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#000" stroke="#000"/></g></svg>`,
  wB: `<svg viewBox="0 0 45 45"><g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#000" stroke-linejoin="miter"/></g></svg>`,
  wQ: `<svg viewBox="0 0 45 45">
    <g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 13a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z"/>
      <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/>
      <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/>
      <circle cx="6" cy="12" r="2"/>
      <circle cx="14" cy="9" r="2"/>
      <circle cx="22.5" cy="8" r="2"/>
      <circle cx="31" cy="9" r="2"/>
      <circle cx="39" cy="12" r="2"/>
    </g>
  </svg>`,  
  wK: `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>`,
  bP: `<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  bR: `<svg viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/></g></svg>`,
  bN: `<svg viewBox="0 0 45 45"><g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#000"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#000"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#fff" stroke="#fff"/><path d="M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#fff" stroke="#fff"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z" fill="#fff" stroke="none"/></g></svg>`,
  bB: `<svg viewBox="0 0 45 45"><g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#000" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/></g></svg>`,
  bQ: `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#000" stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" stroke-linecap="butt" fill="#000"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill="#000"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke-linecap="butt"/><path d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0" fill="none" stroke="#fff"/></g></svg>`,
  bK: `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#000" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#000"/><path d="M20 8h5" stroke-linejoin="miter"/><path d="M32 29.5s8.5-4 6.03-9.65C34.15 14 25 18 22.5 24.5l.01 2.1-.01-2.1C20 18 9.906 14 6.997 19.85c-2.497 5.65 4.853 9 4.853 9M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>`
};

// Starting position for the standard chess board setup
const defaultPosition = {
  'a1': 'wR', 'b1': 'wN', 'c1': 'wB', 'd1': 'wQ', 'e1': 'wK', 'f1': 'wB', 'g1': 'wN', 'h1': 'wR',
  'a2': 'wP', 'b2': 'wP', 'c2': 'wP', 'd2': 'wP', 'e2': 'wP', 'f2': 'wP', 'g2': 'wP', 'h2': 'wP',
  'a7': 'bP', 'b7': 'bP', 'c7': 'bP', 'd7': 'bP', 'e7': 'bP', 'f7': 'bP', 'g7': 'bP', 'h7': 'bP',
  'a8': 'bR', 'b8': 'bN', 'c8': 'bB', 'd8': 'bQ', 'e8': 'bK', 'f8': 'bB', 'g8': 'bN', 'h8': 'bR',
};

function App() {
  const [boardPosition, setBoardPosition] = useState({});
  const [history, setHistory] = useState([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentDrag, setCurrentDrag] = useState(null);
  const [fenInput, setFenInput] = useState('');

  // Centralized function to update board state and manage history
  const updateBoardPosition = (newPosition, saveToHistory = true) => {
    // Only update history if requested and if the position is actually different.
    if (saveToHistory && JSON.stringify(newPosition) !== JSON.stringify(boardPosition)) {
      setHistory(prevHistory => [...prevHistory, boardPosition]);
    }
    setBoardPosition(newPosition);
  };
  
  // Set up default board position on initial load without adding to history
  useEffect(() => {
    setDefaultBoard(false);
  }, []);
  
  // Clear the board
  const clearBoard = (saveToHistory = true) => {
    updateBoardPosition({}, saveToHistory);
  };
  
  // Set default starting position
  const setDefaultBoard = (saveToHistory = true) => {
    updateBoardPosition({...defaultPosition}, saveToHistory);
  };

  // Undo the last board modification
  const undo = () => {
    if (history.length > 0) {
      const lastPosition = history[history.length - 1];
      const newHistory = history.slice(0, -1);
      
      // Set board position without adding to history again
      setBoardPosition(lastPosition);
      setHistory(newHistory);
    }
  };
  
  // Flip the board perspective
  const flipBoard = () => {
    setIsFlipped(!isFlipped);
  };

  // Handle FEN input change
  const handleFenInputChange = (e) => {
    setFenInput(e.target.value);
  };

  // Generate FEN string from current board position
  const generateFEN = () => {
    let fen = '';
    
    // Iterate through ranks (8 to 1) and files (a to h)
    for (let rank = 8; rank >= 1; rank--) {
      let emptySquares = 0;
      
      for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
        const file = String.fromCharCode(97 + fileIndex); // 'a' to 'h'
        const square = `${file}${rank}`;
        const piece = boardPosition[square];
        
        if (piece) {
          // If there were empty squares before this piece, add the count
          if (emptySquares > 0) {
            fen += emptySquares;
            emptySquares = 0;
          }
          
          // Convert piece notation to FEN character
          // wP -> P, bP -> p, etc.
          const color = piece.charAt(0);
          const pieceType = piece.charAt(1);
          fen += color === 'w' ? pieceType : pieceType.toLowerCase();
        } else {
          // Empty square, increment counter
          emptySquares++;
        }
      }
      
      // If there are empty squares at the end of the rank, add the count
      if (emptySquares > 0) {
        fen += emptySquares;
      }
      
      // Add rank separator (except for the last rank)
      if (rank > 1) {
        fen += '/';
      }
    }
    
    // For simplicity, add default values for the remaining FEN components
    // This assumes white to move, all castling rights, no en passant, 0 halfmove clock, move 1
    fen += ' w KQkq - 0 1';
    
    return fen;
  };

  // Handle EXPORT button click
  const exportFEN = () => {
    const fen = generateFEN();
    setFenInput(fen);
  };

  // Parse FEN string and update board
  const parseFEN = (saveToHistory = true) => {
    if (!fenInput.trim()) return;
    
    try {
      const newPosition = {};
      // Get the piece placement part (first section before space)
      const parts = fenInput.split(' ');
      const piecePositions = parts[0];
      
      let rank = 8;
      let file = 0;
      
      for (let i = 0; i < piecePositions.length; i++) {
        const char = piecePositions[i];
        
        if (char === '/') {
          // Move to the next rank
          rank--;
          file = 0;
        } else if (/\d/.test(char)) {
          // Skip empty squares
          file += parseInt(char, 10);
        } else {
          // Place a piece
          const fileChar = String.fromCharCode(97 + file); // 'a' to 'h'
          const square = `${fileChar}${rank}`;
          
          // Map FEN piece notation to our piece notation
          const colorPrefix = char === char.toUpperCase() ? 'w' : 'b';
          const pieceChar = char.toUpperCase();
          
          let pieceType;
          switch (pieceChar) {
            case 'P': pieceType = 'P'; break;
            case 'R': pieceType = 'R'; break;
            case 'N': pieceType = 'N'; break;
            case 'B': pieceType = 'B'; break;
            case 'Q': pieceType = 'Q'; break;
            case 'K': pieceType = 'K'; break;
            default: continue; // Skip invalid characters
          }
          
          newPosition[square] = `${colorPrefix}${pieceType}`;
          file++;
        }
      }
      
      updateBoardPosition(newPosition, saveToHistory);
    } catch (error) {
      console.error('Error parsing FEN:', error);
    }
  };
  
  // Calculate cell from coordinates
  const getCellFromCoords = (x, y, boardElement) => {
    const boardRect = boardElement.getBoundingClientRect();
    
    // Check if coordinates are within the board
    if (
      x >= boardRect.left && 
      x <= boardRect.right && 
      y >= boardRect.top && 
      y <= boardRect.bottom
    ) {
      // Calculate cell position
      const cellSize = boardRect.width / 8;
      let fileIndex = Math.floor((x - boardRect.left) / cellSize);
      let rankIndex = Math.floor((y - boardRect.top) / cellSize);
      
      // Adjust indices if board is flipped
      if (isFlipped) {
        fileIndex = 7 - fileIndex;
        rankIndex = 7 - rankIndex;
      }
      
      const file = String.fromCharCode(97 + fileIndex); // 'a' to 'h'
      const rank = 8 - rankIndex; // 1 to 8
      
      return `${file}${rank}`;
    }
    
    return null;
  };
  
  // Start drag - for mobile and desktop
  const handlePieceMouseDown = (e, piece, sourceCell = null) => {
    e.preventDefault();
    
    const boardElement = document.getElementById('chess-board');
    if (!boardElement) return;
    
    // Initial piece information
    setCurrentDrag({
      piece,
      sourceCell,
      element: null,
      offsetX: 0,
      offsetY: 0
    });
    
    // Create a ghost element for dragging
    const ghostElement = document.createElement('div');
    ghostElement.className = 'piece-ghost';
    ghostElement.innerHTML = pieceSvgs[piece];
    document.body.appendChild(ghostElement);
    
    // Calculate offset for centered dragging
    let clientX, clientY;
    if (e.type === 'touchstart') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = clientX - (rect.left + rect.width / 2);
    const offsetY = clientY - (rect.top + rect.height / 2);
    
    // Position the ghost element
    ghostElement.style.left = (clientX - offsetX) + 'px';
    ghostElement.style.top = (clientY - offsetY) + 'px';
    
    // Update the drag state with the ghost element
    setCurrentDrag(prev => ({
      ...prev,
      element: ghostElement,
      offsetX,
      offsetY
    }));
    
    // Add move and end event listeners
    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      let moveX, moveY;
      
      if (moveEvent.type === 'touchmove') {
        moveX = moveEvent.touches[0].clientX;
        moveY = moveEvent.touches[0].clientY;
      } else {
        moveX = moveEvent.clientX;
        moveY = moveEvent.clientY;
      }
      
      ghostElement.style.left = (moveX - offsetX) + 'px';
      ghostElement.style.top = (moveY - offsetY) + 'px';
    };
    
    const handleEnd = (endEvent) => {
      // Remove move and end event listeners
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('touchmove', handleMove, { passive: false });
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchend', handleEnd);
      
      // Get final position
      let endX, endY;
      if (endEvent.type === 'touchend') {
        // For touch events, use the last known position since touchend doesn't have coordinates
        const touch = endEvent.changedTouches[0];
        endX = touch.clientX;
        endY = touch.clientY;
      } else {
        endX = endEvent.clientX;
        endY = endEvent.clientY;
      }
      
      // Find target cell
      const targetCell = getCellFromCoords(endX, endY, boardElement);
      
      // Create a new position object to modify
      const newPosition = {...boardPosition};
      
      // If we're dragging from the board, remove the piece from its original position
      if (sourceCell) {
        delete newPosition[sourceCell];
      }
      
      // If dropping on a valid cell, place the piece there
      if (targetCell) {
        newPosition[targetCell] = piece;
      }
      
      // Update the board. The helper function will handle history and check for changes.
      updateBoardPosition(newPosition);
      
      // Remove the ghost element
      if (ghostElement && ghostElement.parentNode) {
        ghostElement.parentNode.removeChild(ghostElement);
      }
      
      // Clear drag state
      setCurrentDrag(null);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
  };
  
  // Render the board
  const renderBoard = () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    
    // If board is flipped, reverse the arrays
    const displayFiles = isFlipped ? [...files].reverse() : files;
    const displayRanks = isFlipped ? [...ranks].reverse() : ranks;
    
    return (
      <div className="board-container">
        <div className="file-labels">
          {displayFiles.map(file => (
            <div key={`file-${file}`} className="label">{file}</div>
          ))}
        </div>
        <div className="board-with-ranks">
          <div className="rank-labels">
            {displayRanks.map(rank => (
              <div key={`rank-${rank}`} className="label">{rank}</div>
            ))}
          </div>
          <div id="chess-board" className="board">
            {displayRanks.map((rank, rankIndex) => (
              displayFiles.map((file, fileIndex) => {
                const isLight = (rankIndex + fileIndex) % 2 === 0;
                const cellKey = `${file}${rank}`;
                const piece = boardPosition[cellKey];
                
                return (
                  <div 
                    key={cellKey} 
                    className={`cell ${isLight ? 'light' : 'dark'}`}
                  >
                    {piece && (
                      <div 
                        className="piece"
                        onMouseDown={(e) => handlePieceMouseDown(e, piece, cellKey)}
                        onTouchStart={(e) => handlePieceMouseDown(e, piece, cellKey)}
                        dangerouslySetInnerHTML={{ __html: pieceSvgs[piece] }}
                      />
                    )}
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>
    );
  };
  
  // Render the piece palette (buttons at the bottom)
  const renderPiecePalette = () => {
    const whitePieces = ['wR', 'wN', 'wB', 'wQ', 'wK', 'wP'];
    const blackPieces = ['bR', 'bN', 'bB', 'bQ', 'bK', 'bP'];
    
    return (
      <div className="piece-palette">
        <div className="palette-row">
          {whitePieces.map((piece, index) => (
            <div 
              key={`white-${index}`} 
              className="palette-piece"
              onMouseDown={(e) => handlePieceMouseDown(e, piece)}
              onTouchStart={(e) => handlePieceMouseDown(e, piece)}
              dangerouslySetInnerHTML={{ __html: pieceSvgs[piece] }}
            />
          ))}
        </div>
        <div className="palette-row">
          {blackPieces.map((piece, index) => (
            <div 
              key={`black-${index}`} 
              className="palette-piece"
              onMouseDown={(e) => handlePieceMouseDown(e, piece)}
              onTouchStart={(e) => handlePieceMouseDown(e, piece)}
              dangerouslySetInnerHTML={{ __html: pieceSvgs[piece] }}
            />
          ))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="chess-app">
      <div className="controls">
        <button onClick={clearBoard}>EMPTY</button>
        <button onClick={setDefaultBoard}>DEFAULT</button>
        <button onClick={undo} disabled={history.length === 0}>UNDO</button>
        <button onClick={flipBoard}>FLIP</button>
      </div>
      
      <div className="fen-controls">
        <input
          type="text"
          value={fenInput}
          onChange={handleFenInputChange}
          placeholder="Enter FEN string"
        />
        <button onClick={parseFEN}>PARSE</button>
        <button onClick={exportFEN}>EXPORT</button>
      </div>
      
      {renderBoard()}
      {renderPiecePalette()}
    </div>
  );
}

export default App;