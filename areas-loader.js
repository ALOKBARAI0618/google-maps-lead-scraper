/**
 * Areas Loader — converts the browser-format areas.js into a Node.js module.
 * Reads the original areas.js, executes it in a sandboxed context, and exports
 * CITY_AREAS, CITY_ALIASES, and detectCityAndAreas.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Create a fake `window` object so the browser-format areas.js can execute
const sandbox = { window: {} };
vm.createContext(sandbox);

// Load and execute the original areas.js
const areasCode = fs.readFileSync(path.join(__dirname, 'areas.js'), 'utf8');
vm.runInContext(areasCode, sandbox);

// Extract the data from the sandbox — the file defines CITY_AREAS, CITY_ALIASES,
// and detectCityAndAreas inside the `if (typeof window.__cityAreasLoaded ...)` guard.
// Since our sandbox window starts fresh, the guard passes and everything is defined.

// The variables are block-scoped (const), so they live inside the if-block.
// But detectCityAndAreas is assigned to window.detectCityAndAreas at the end.
// We need to re-execute with a slightly modified approach to capture the consts.

// Alternative: parse the file and extract the objects directly
function parseAreasFile() {
  // Extract the CITY_AREAS object
  const areasMatch = areasCode.match(/const\s+CITY_AREAS\s*=\s*\{/);
  if (!areasMatch) throw new Error('Could not find CITY_AREAS in areas.js');

  // Find matching closing brace
  const startIdx = areasMatch.index + 'const CITY_AREAS = '.length;
  let braceCount = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < areasCode.length; i++) {
    if (areasCode[i] === '{') braceCount++;
    if (areasCode[i] === '}') braceCount--;
    if (braceCount === 0) { endIdx = i + 1; break; }
  }
  const areasJson = areasCode.slice(startIdx, endIdx);

  // Extract CITY_ALIASES the same way
  const aliasMatch = areasCode.match(/const\s+CITY_ALIASES\s*=\s*\{/);
  let aliasJson = '{}';
  if (aliasMatch) {
    const aStart = aliasMatch.index + 'const CITY_ALIASES = '.length;
    let bc = 0, aEnd = aStart;
    for (let i = aStart; i < areasCode.length; i++) {
      if (areasCode[i] === '{') bc++;
      if (areasCode[i] === '}') bc--;
      if (bc === 0) { aEnd = i + 1; break; }
    }
    aliasJson = areasCode.slice(aStart, aEnd);
  }

  // Evaluate them as JS objects
  const CITY_AREAS = eval('(' + areasJson + ')');
  const CITY_ALIASES = eval('(' + aliasJson + ')');

  return { CITY_AREAS, CITY_ALIASES };
}

const { CITY_AREAS, CITY_ALIASES } = parseAreasFile();

/**
 * Detects the city from a search query and returns the list of surrounding areas.
 * @param {string} query - e.g. "digital marketing mumbai"
 * @returns {{ city: string, keyword: string, areas: string[] } | null}
 */
function detectCityAndAreas(query) {
  const lowerQuery = query.toLowerCase().trim();

  const allCityNames = [
    ...Object.keys(CITY_AREAS),
    ...Object.keys(CITY_ALIASES)
  ].sort((a, b) => b.length - a.length);

  for (const cityName of allCityNames) {
    if (lowerQuery.includes(cityName)) {
      const canonicalCity = CITY_ALIASES[cityName] || cityName;
      const areas = CITY_AREAS[canonicalCity] || [];
      const keyword = lowerQuery.replace(new RegExp(cityName, 'gi'), '').trim();

      return { city: canonicalCity, keyword, areas, matchedName: cityName };
    }
  }

  return null;
}

module.exports = { CITY_AREAS, CITY_ALIASES, detectCityAndAreas };
