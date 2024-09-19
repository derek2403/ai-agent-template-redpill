// src/csvReader.d.ts

export declare function readCSVFile(relativeFilePath: string): Promise<Array<{ datetime: string; price: number }>>;
