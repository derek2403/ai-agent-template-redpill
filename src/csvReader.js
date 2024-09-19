// src/csvReader.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Reads and parses a CSV file.
 * @param {string} relativeFilePath - Relative path to the CSV file.
 * @returns {Promise<Array<{ datetime: string; price: number }>>} - Parsed historical prices.
 */
export async function readCSVFile(relativeFilePath) {
    try {
        // Resolve the absolute path to the CSV file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const absolutePath = path.resolve(__dirname, relativeFilePath);

        // Read the CSV file as a string
        const data = await fs.readFile(absolutePath, 'utf-8');

        // Split the CSV into lines and parse headers
        const lines = data.trim().split('\n');
        const headers = lines[0].split(',');

        // Parse each subsequent line into an object
        const historicalPrices = lines.slice(1).map(line => {
            const values = line.split(',');
            return {
                datetime: values[headers.indexOf('DateTime')].trim(),
                price: parseFloat(values[headers.indexOf('Price')].trim())
            };
        }).filter(entry => !isNaN(entry.price)); // Filter out invalid entries

        return historicalPrices;
    } catch (error) {
        console.error('Error reading CSV file:', error);
        return [];
    }
}
