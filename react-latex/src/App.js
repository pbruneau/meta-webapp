import React from 'react';
import LatexRenderer from './LatexRenderer';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1 className="text-4xl font-bold mb-6">LaTeX Renderer</h1>
      <LatexRenderer />
    </div>
  );
}

export default App;