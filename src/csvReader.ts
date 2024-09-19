// src/csvReader.ts

import path from 'path';
import { fileURLToPath } from 'url';

export interface HistoricalPrice {
    datetime: string;
    price: number;
}

/**
 * Retrieves historical prices by reading and parsing the CSV file.
 * @returns {Promise<HistoricalPrice[]>} - Array of historical price objects.
 */
export async function getHistoricalPrices(): Promise<HistoricalPrice[]> {
    try {
        // Dynamically import the JS module
        const { readCSVFile } = await import('./csvReader.js');

        // Define the relative path to the CSV file
        const relativeCsvPath = './history.csv'; // Adjust if CSV is in a different location

        // Call the JS function to read and parse the CSV
        const historicalPrices: HistoricalPrice[] = await readCSVFile(relativeCsvPath);

        return historicalPrices;
    } catch (error) {
        console.error('Error accessing historical data:', error);
        return [];
    }
}
