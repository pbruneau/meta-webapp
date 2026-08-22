import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

const App = () => {
  const [words, setWords] = useState([]);  // State to store the words list from the backend
  const [word, setWord] = useState('');  // State to hold the current word input by the user
  const [colors, setColors] = useState([]);  // State to manage colors of the current word
  const [stackedWords, setStackedWords] = useState([]);  // State to store stacked words
  const [canonical, setCanonical] = useState(true);  // State to manage the case preference
  const [columns, setColumns] = useState(10);  // State to manage the number of columns

  // Fetch words from the Flask backend when the component mounts
  useEffect(() => {
    fetch('/desutom/api/words')
      .then(response => response.json())
      .then(data => setWords(data))
      .catch(error => console.error('Error fetching words:', error));
  }, []);

  // Send the stacked words and case preference to the backend whenever they change
  useEffect(() => {
    if (stackedWords.length > 0) {  // Only send when there are stacked words
      fetch('/desutom/api/words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stackedWords, canonical })  // Send words and case preference
      })
      .then(response => response.json())
      .then(data => setWords(data))
      .catch(error => console.error('Error updating words:', error));
    }
  }, [stackedWords, canonical]);  // Dependency on stackedWords and canonical to run whenever they change

  // Handle input changes and reset colors
  const handleInputChange = (e) => {
    const newWord = e.target.value.toUpperCase();
    setWord(newWord);

    // Initialize colors: first letter red, the rest blue
    const initialColors = newWord.split('').map((_, index) => (index === 0 ? 'red' : 'blue'));
    setColors(initialColors);  // Set initial colors for each new word
  };

  // Toggle the color of a button
  const toggleColor = (index) => {
    const currentColor = colors[index];
    const nextColor = ['blue', 'red', '#DAA520'][(['blue', 'red', '#DAA520'].indexOf(currentColor) + 1) % 3];
    setColors(colors.map((color, i) => (i === index ? nextColor : color)));
  };

  // Stack the current word line
  const stackWord = () => {
    if (word) {
      // Store the word along with its colors
      setStackedWords([...stackedWords, { word, colors: [...colors] }]);  // Make sure to copy the colors array
      setWord('');  // Clear the input field
      setColors([]);  // Clear the colors for the next input
    }
  };

  // Handle case change
  const handleCaseChange = () => {
    setCanonical(!canonical);  // Toggle the case preference
  };

  // Function to calculate the number of columns based on window width
  const calculateColumns = () => {
    const cellWidth = 120;  // Estimated width of each cell, including padding and margin
    const windowWidth = window.innerWidth;
    const numColumns = Math.max(Math.floor(windowWidth / cellWidth), 1);  // Ensure at least one column
    setColumns(numColumns);
  };

  // Adjust columns on window resize
  useEffect(() => {
    calculateColumns();  // Calculate the initial number of columns

    const handleResize = () => {
      calculateColumns();  // Recalculate the number of columns on window resize
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div>
      {/* Input field for the word */}
      <input
        type="text"
        value={word}
        onChange={handleInputChange}
        placeholder="Taper un mot"
        style={{ marginBottom: '20px', padding: '10px', fontSize: '16px' }}
      />

      {/* Display buttons for each letter in the word */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '20px' }}>
        {word.split('').map((letter, index) => (
          <button
            key={index}
            onClick={() => toggleColor(index)}
            style={{
              backgroundColor: colors[index],
              color: 'white',
              padding: '10px',
              fontSize: '16px',
              margin: '5px'
            }}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Checkbox for case preference */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={stackWord}
          style={{ padding: '10px', fontSize: '16px' }}
        >
          Ajouter Mot
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}> {/* Flex container for label and checkbox */}
          <label style={{ margin: 0 }}>Lemmes uniquement</label>
          <input
            type="checkbox"
            checked={canonical}
            onChange={handleCaseChange}
          />
        </div>
      </div>

      {/* Display stacked words */}
      <div>
        {stackedWords.map((stacked, index) => (
          <div key={index} style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
            {stacked.word.split('').map((letter, i) => (
              <button
                key={i}
                style={{
                  backgroundColor: stacked.colors[i],  // Use the stored colors for each letter
                  color: 'white',
                  padding: '10px',
                  fontSize: '16px',
                  margin: '5px',
                  cursor: 'default'  // Disable the pointer to indicate these buttons are non-interactive
                }}
                disabled  // Disable the button to make it non-interactive
              >
                {letter}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Display the table of words */}
      <div>
        <table>
          <tbody>
            {Array.from({ length: Math.ceil(words.length / columns) }, (_, rowIndex) => (
              <tr key={rowIndex}>
                {words.slice(rowIndex * columns, rowIndex * columns + columns).map((word, colIndex) => (
                  <td
                    key={colIndex}
                    style={{
                      padding: '10px',
                      border: '1px solid black',
                      textAlign: 'center'
                    }}
                  >
                    {word}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
