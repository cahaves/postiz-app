const Module = require('module');
const { TestEnvironment } = require('jest-environment-jsdom');

module.exports = class extends TestEnvironment {
  constructor(config, context) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, ...options) {
      // These editor tests need DOM APIs, not optional native canvas drawing.
      if (request === 'canvas' && parent?.filename.includes('/jsdom/')) {
        const error = new Error(
          'Optional canvas is unavailable in editor tests'
        );
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      }
      return resolveFilename.call(this, request, parent, ...options);
    };
    try {
      super(config, context);
    } finally {
      Module._resolveFilename = resolveFilename;
    }
  }
};
