import levenshtein from "js-levenshtein";

export const generateAutocomplete = (input: string, queries: string[]) => {
    input = input.toLowerCase();
    // sort from most similar to least similar
    queries = queries.sort((a, b) => {
        return levenshtein(input, a) - levenshtein(input, b);
    });

    // return the first match
    return queries.find(q => {
        return levenshtein(input, q) <= 3;
    })
}

    