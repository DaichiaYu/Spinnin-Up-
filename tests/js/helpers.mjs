import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
export const exercises = JSON.parse(readFileSync(new URL('data/exercises.json', root), 'utf8')).exercises;
export const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
export const equipment = JSON.parse(readFileSync(new URL('data/equipment.json', root), 'utf8')).equipment;
