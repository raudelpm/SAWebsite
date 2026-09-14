/**
 * Service-area unit checks. Run: node api/lib/service-area.test.js
 */

import {
  checkServiceArea,
  extractCityFromAddress,
  normalizeCityName,
} from "./service-area.js";

let failed = 0;

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    failed += 1;
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

function expectStatus(city, expected) {
  const result = checkServiceArea({ city });
  assertEqual(`checkServiceArea(${JSON.stringify(city)}).status`, result.status, expected);
}

// Required cases
expectStatus("Sarasota", "in_area");
expectStatus("Bradenton", "in_area");
expectStatus("North Port", "in_area");
expectStatus("Venice", "in_area");
expectStatus("Lakewood Ranch", "in_area");
expectStatus("Port Charlotte", "in_area");
expectStatus("Tampa", "out_of_area");
expectStatus("St. Petersburg", "out_of_area");
expectStatus("Orlando", "out_of_area");
expectStatus("Fort Myers", "out_of_area");
expectStatus("Someville", "unknown");

// Variants
expectStatus("northport", "in_area");
expectStatus("NORTH PORT", "in_area");
expectStatus("lakewood ranch", "in_area");
assertEqual('normalizeCityName("northport")', normalizeCityName("northport"), "North Port");
assertEqual('normalizeCityName("NORTH PORT")', normalizeCityName("NORTH PORT"), "North Port");
assertEqual(
  'normalizeCityName("lakewood ranch")',
  normalizeCityName("lakewood ranch"),
  "Lakewood Ranch"
);

// Address extraction should find city without a separate city field
const fromAddr = extractCityFromAddress("412 Palm Ave, Sarasota, FL 34236");
assertEqual("extract city from address", fromAddr.city, "Sarasota");
assertEqual(
  "address city is in_area",
  checkServiceArea({ city: fromAddr.city }).status,
  "in_area"
);

const tampaAddr = extractCityFromAddress("100 Main St, Tampa, FL 33602");
assertEqual("extract Tampa from address", tampaAddr.city, "Tampa");
assertEqual(
  "Tampa address out_of_area",
  checkServiceArea({ city: tampaAddr.city }).status,
  "out_of_area"
);

if (failed) {
  console.error(`\n${failed} failing assertion(s)`);
  process.exit(1);
}
console.log("\nAll service-area tests passed.");
