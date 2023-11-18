// Add references
const fs = require('fs');
const fsp = fs.promises;
const highland = require('highland');
const csv = require('csv-parser');

// Specify the path to the csv file
const csvFilePath = 'main-translations.csv';

// Create a readable stream of the above csv
const readStream = fs.createReadStream(csvFilePath);

// Use highland to wrap the stream
const stream = highland(readStream);

// We're using this variable later to ignore any rows in csv
// In this particular instance, we're going to ignore the first 7 rows
// of the csv
const IGNORE_ROWS = 7;

// We're using this as the output directory for the translation.json files
// As-is, this will put the translation.json files into /public/locales/
const TARGET_DIR = `${__dirname}/public/locales/`;

// The spreadsheet contains all translations for a given i18next aliases in one row
// In order to collect all values into a 'row' for each locale, we map each column's
// position to its respective locale.
// ! This will need to be edited for all the languages that you are translating or
// ! if you add new language translations
// * First value is column number (zero-based) and second value is the language code
const localeMapping = {
  2: 'am',
  3: 'ar',
  4: 'chk',
  5: 'de',
  6: 'en',
  7: 'es',
  8: 'fa',
  9: 'fj',
  10: 'fr',
  11: 'gu',
  12: 'hi',
  13: 'hmn',
  14: 'ja',
  15: 'kar',
  16: 'km',
  17: 'ko',
  18: 'lo',
  19: 'mam',
  20: 'mh',
  21: 'mr',
  22: 'mxb',
  23: 'my',
  24: 'ne',
  25: 'om',
  26: 'pa',
  27: 'prs',
  28: 'ps',
  29: 'pt-BR',
  30: 'ro',
  31: 'ru',
  32: 'sm',
  33: 'so',
  34: 'sw',
  35: 'ta',
  36: 'te',
  37: 'th',
  38: 'ti',
  39: 'tl',
  40: 'to',
  41: 'tr',
  42: 'uk',
  43: 'ur',
  44: 'vi',
  45: 'zh',
  46: 'zh-tw',
};

// This is the target object we will building up, with one key for each locale
// "row" we expect and all its translated values.
const locales = Object.values(localeMapping).reduce((memo, locale) => ({ ...memo, [locale]: {} }), {});

// Pipe stream through csv-parser and output the translations.json files
function run() {
  stream
    .split('\n') // Split the response into lines
    .drop(IGNORE_ROWS) // Ignore first set of rows if contains instructions
    .intersperse('\n') // Creates a new stream with newline separator
    .through(csv({ headers: false })) // Tell csv-parser not to look for headers in csv
    .reduce(locales, (locales, row) => {
      const field = row['1'];

      // Skip rows with empty fields in '1' column (zero-based).  These would be rows
      // with the i18next alias omitted
      if (!field) {
        return locales;
      }

      for (let [position, value] of Object.entries(row)) {
        // Don't write untranslated/blank strings to file. We'd rather fall
        // back to untranslated English strings than show a blank string
        if (position === '0' || position === '1' || !value) {
          continue;
        }

        Object.assign(locales[localeMapping[position]], { [field]: value });
      }

      return locales;
    })
    // Now we ungroup the locales object into a stream of individual locale
    // objects that we want to write to disk
    .flatMap((locales) => {
      for (const locale of Object.keys(locales)) {
        locales[locale].localeCode = locale;
      }
      return Object.values(locales);
    })
    // Highland abstracts over streamable objects, including Promises. So now
    // we map over each locale object and write it to disk, returning the file
    // operation as a result
    .map(async (locale) => {
      const dir = `${TARGET_DIR}/${locale.localeCode}`;
      try {
        await fsp.mkdir(dir, { recursive: true });
        const result = await fsp.writeFile(`${dir}/translation.json`, JSON.stringify(locale, null, 2), { flag: 'w' });
        return highland(result);
      } catch (err) {
        console.error({
          locale: locale.localeCode,
          err: err.message,
        });

        throw err;
      }
    })
    // In order to handle the async file IO operations as a stream and
    // appropriately wait for them all to close, we wrap each promise back in
    // Highland
    .flatMap(highland)
    // To allow the stream to continue on errors, uncomment and do whatever
    // you want. Otherwise, the procedure will crash on first error
    //.errors(err => console.error(err))
    .done(() => console.log('Done parsing local .csv'));
}

run();
