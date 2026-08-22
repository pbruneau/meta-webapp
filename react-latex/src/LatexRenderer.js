import React, { useState, useRef, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';
import './App.css';

const LatexRenderer = () => {
  const [latexInput, setLatexInput] = useState('');
  const [renderedLatex, setRenderedLatex] = useState('');
  const [inputWidth, setInputWidth] = useState(100);
  const inputRef = useRef(null);

  useEffect(() => {
    adjustInputWidth();
  }, [latexInput]);

  const adjustInputWidth = () => {
    if (inputRef.current) {
      const textWidth = getTextWidth(latexInput, getComputedStyle(inputRef.current).font);
      const newWidth = Math.min(Math.max(100, textWidth + 20), 1400); // 1400px is the max-width
      setInputWidth(newWidth);
    }
  };

  const getTextWidth = (text, font) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = font;
    return context.measureText(text).width;
  };

  const handleInputChange = (e) => {
    setLatexInput(e.target.value);
  };

  const handleValidation = () => {
    setRenderedLatex(latexInput);
  };

  return (
    <div className="p-4 w-full max-w-4xl mx-auto">
      <input
        ref={inputRef}
        type="text"
        className="p-2 border border-gray-300 rounded text-2xl mb-2"
        style={{ width: `${inputWidth}px`, maxWidth: '100%' }}
        value={latexInput}
        onChange={handleInputChange}
        placeholder="Enter LaTeX formula"
      />
      <button
        className="w-full mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-xl"
        onClick={handleValidation}
      >
        Render LaTeX
      </button>
      {renderedLatex && (
        <div className="mt-4 p-4 border border-gray-300 rounded overflow-x-auto padding-vertical">
          <InlineMath math={renderedLatex} style={{fontSize: '36pt'}} />
        </div>
      )}
    </div>
  );
};

export default LatexRenderer;