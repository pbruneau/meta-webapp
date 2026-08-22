from flask import Flask, jsonify, request
from flask_cors import CORS  # type: ignore

app = Flask(__name__, static_url_path='/desutom/static')
CORS(app)  # Enable CORS for all routes

import re
import math
import pandas as pd # type: ignore
from unidecode import unidecode # type: ignore
from collections import Counter


# UTILITY FUNCTIONS
def compute_dictionary_frequencies(l):
    # Combine all words into a single string
    all_words = ''.join(l)
    
    # Calculate the frequency of each letter in the dictionary
    letter_frequency = Counter(all_words)
    
    # Calculate the total number of letters in the dictionary
    total_letters = sum(letter_frequency.values())
    
    # Calculate the relative frequency of each letter
    dictionary_frequencies = {char: freq / total_letters for char, freq in letter_frequency.items()}    
    return dictionary_frequencies

def generate_suggestions(red_letters, yellow_letters, blue_letters, constraints, lexique):
    # 1. Count constraints (Lookaheads)
    count_patterns = []
    for char, (min_c, max_c) in constraints.items():
        # Min count: Must appear at least min_c times
        if min_c > 0:
            count_patterns.append(f'(?=(?:[^{char}]*{char}){{{min_c},}})')
        
        # Max count: Must NOT appear more than max_c times
        if max_c is not None:
            # Negative lookahead: Fail if we match (max_c + 1) instances
            count_patterns.append(f'(?!(?:[^{char}]*{char}){{{max_c + 1},}})')

    # 2. Positional filters (Regex character classes)
    pos_patterns = []
    for i in range(len(red_letters)):
        if red_letters[i] is not None:
            # Red: specific letter required
            pos_patterns.append(red_letters[i])
        else:
            # Build excluded set for this specific position
            excluded_here = set()
            
            # Yellow at this specific pos? Exclude it here
            if i in yellow_letters:
                excluded_here.add(yellow_letters[i])
            
            # Blue at this specific pos? Exclude it here
            if i in blue_letters:
                excluded_here.add(blue_letters[i])
                
            # If a letter is globally banned (max_count == 0), exclude it here too
            # (Strictly speaking handled by lookaheads, but this optimizes the regex)
            for char, (min_c, max_c) in constraints.items():
                if max_c == 0:
                    excluded_here.add(char)
                    
            if excluded_here:
                pos_patterns.append('[^' + ''.join(excluded_here) + ']')
            else:
                pos_patterns.append('.')

    full_pattern = '^' + ''.join(count_patterns) + ''.join(pos_patterns) + '$'
    
    # Compile and match
    regex = re.compile(full_pattern, re.IGNORECASE)
    suggestions = [word for word in lexique if regex.match(word)]

    return suggestions

def compute_weighted_entropy(word, dictionary_frequencies):
    # Calculate the frequency of each letter in the word
    frequency = Counter(word)
    
    # Calculate the probabilities of each letter in the word
    total_letters = len(word)
    word_probabilities = {char: freq / total_letters for char, freq in frequency.items()}

    # Calculate the weighted entropy
    weighted_entropy = -sum(p * math.log2(p) * dictionary_frequencies.get(char, 1/26) for char, p in word_probabilities.items() if p > 0)
    
    return weighted_entropy

def rank_words_by_entropy(candidate_words, dictionary_frequencies):
    # Compute the weighted entropy for each candidate word
    entropy_list = [(word, compute_weighted_entropy(word, dictionary_frequencies)) for word in candidate_words]
    
    # Sort the candidate words based on their weighted entropy in descending order
    ranked_words = sorted(entropy_list, key=lambda x: x[1], reverse=True)
    ranked_words = [w[0] for w in ranked_words]
    return ranked_words

def unique_first_occurrences(lst):
    seen = set()
    result = []
    for item in lst:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result

def merge_ordered_lists(*lists):
    # Create a dictionary to store the minimum ranks of each word
    word_ranks = {}
    
    # Iterate through each list to populate the dictionary
    for lst in lists:
        for rank, word in enumerate(lst):
            if word in word_ranks:
                word_ranks[word] = min(word_ranks[word], rank)
            else:
                word_ranks[word] = rank
    
    # Find the intersection of all lists
    common_words = set(lists[0])
    for lst in lists[1:]:
        common_words.intersection_update(lst)
    
    # Filter the dictionary to include only the common words
    common_word_ranks = {word: rank for word, rank in word_ranks.items() if word in common_words}
    
    # Sort the words based on their minimum rank
    sorted_common_words = sorted(common_word_ranks, key=lambda word: common_word_ranks[word])
    
    return sorted_common_words

def transcode_word(word_data):
    word = word_data.get('word', '')
    colors = word_data.get('colors', [])

    red_letters = [None] * len(word)
    yellow_letters = {} # pos -> char
    blue_letters = {}   # pos -> char
    
    # Track counts to establish min/max constraints
    letter_counts = {} 

    for i, (letter, color) in enumerate(zip(word, colors)):
        if letter not in letter_counts:
            letter_counts[letter] = {'red': 0, 'yellow': 0, 'blue': 0}
        
        if color == 'red':
            red_letters[i] = letter
            letter_counts[letter]['red'] += 1
        elif color == '#DAA520': # Yellow
            yellow_letters[i] = letter
            letter_counts[letter]['yellow'] += 1
        elif color == 'blue':
            blue_letters[i] = letter
            letter_counts[letter]['blue'] += 1

    constraints = {}
    for char, counts in letter_counts.items():
        min_c = counts['red'] + counts['yellow']
        # If blue is present, it means we have found ALL instances of this letter.
        # The max allowed is exactly the sum of Red + Yellow seen so far.
        if counts['blue'] > 0:
            max_c = min_c
        else:
            max_c = None # No upper limit known yet
        constraints[char] = (min_c, max_c)

    return red_letters, yellow_letters, blue_letters, constraints



dictionary = pd.read_csv('Lexique383.tsv', delimiter='\t')

# Variable to keep track of the current case preference
canonical = True
refwords = dictionary[dictionary['ortho'] == dictionary['lemme']]
refwords = [unidecode(str(v)) for v in refwords['ortho']]
dictionary_frequencies = compute_dictionary_frequencies(refwords)

# Route to handle the GET request, initially returns an empty list repeated 10 times
@app.route('/desutom/api/words', methods=['GET'])
def get_words():
    return jsonify([])

# Route to handle the POST request from the React app
@app.route('/desutom/api/words', methods=['POST'])
def update_words():
    global canonical
    global refwords
    global dictionary_frequencies
    data = request.json  # Get JSON data from the request
    stacked_words = data.get('stackedWords', [])  # Get 'stackedWords' from the data, default to empty list
    canonical = data.get('canonical', True)
    
    if canonical:
        refwords = dictionary[dictionary['ortho'] == dictionary['lemme']]
        refwords = [unidecode(str(v)) for v in refwords['ortho']]
    else:
        refwords = [unidecode(str(v)) for v in dictionary['ortho']]
    dictionary_frequencies = compute_dictionary_frequencies(refwords)

    suggestions = []
    for item in stacked_words:
        # Get the new constraint data structure
        red_letters, yellow_letters, blue_letters, constraints = transcode_word(item)
        
        # Pass it to the generator
        cur_suggestion = generate_suggestions(red_letters, yellow_letters, blue_letters, constraints, refwords)
        
        suggestions.append(unique_first_occurrences(rank_words_by_entropy(cur_suggestion, dictionary_frequencies)))

    processed_words = merge_ordered_lists(*suggestions)
    return jsonify(processed_words)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
