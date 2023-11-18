// Add references
const fs = require('fs');
const fsp = fs.promises;
const highland = require('highland');
const csv = require('csv-parser');

// Specify the path to the csv file
const csvFilePath = 'main-translation.csv';

// Create a readable stream of the above csv
const readStream = fs.createReadStream(csvFilePath);

// Use highland to wrap the stream
const stream = highland(readStream);

// We're using this variable later to ignore any rows in csv
// In this particular instance, we're going to ignore the first 7 rows
// of the csv
const IGNORE_ROWS = 1;

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
  1: 'am',
  2: 'ar',
  3: 'ca',
  4: 'chk',
  5: 'de',
  6: 'en',
  7: 'es',
  8: 'eu',
  9: 'fa',
  10: 'fj',
  11: 'fr',
  12: 'gu',
  13: 'he',
  14: 'hi',
  15: 'hmn',
  16: 'ht',
  17: 'hy',
  18: 'it',
  19: 'ja',
  20: 'kar',
  21: 'km',
  22: 'ko',
  23: 'lo',
  24: 'mam',
  25: 'mh',
  26: 'ml',
  27: 'mr',
  28: 'mxb',
  29: 'my',
  30: 'ne',
  31: 'om',
  32: 'pa',
  33: 'prs',
  34: 'ps',
  35: 'pt-BR',
  36: 'ro',
  37: 'ru',
  38: 'sm',
  39: 'so',
  40: 'sw',
  41: 'ta',
  42: 'te',
  43: 'th',
  44: 'ti',
  45: 'tl',
  46: 'to',
  47: 'tr',
  48: 'uk',
  49: 'ur',
  50: 'vi',
  51: 'zh',
  52: 'zh-TW',
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
      const field = row['0'];

      // Skip rows with empty fields in '1' column (zero-based).  These would be rows
      // with the i18next alias omitted
      if (!field) {
        return locales;
      }

      for (let [position, value] of Object.entries(row)) {
        // Don't write untranslated/blank strings to file. We'd rather fall
        // back to untranslated English strings than show a blank string
        if (position === '0' || !value) {
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
