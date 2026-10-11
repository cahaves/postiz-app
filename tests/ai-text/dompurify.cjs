const createDOMPurify = require('dompurify');
module.exports = createDOMPurify(
  typeof window === 'undefined'
    ? new (require('jsdom').JSDOM)('').window
    : window
);
