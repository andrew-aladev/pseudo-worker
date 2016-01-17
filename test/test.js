'use strict';

var should = require('chai').should();
var Promise = require('pouchdb-promise');
var uaParser = require('ua-parser-js');

var PseudoWorker = require('../');

var implementations = ['pseudo-worker'];

// Not testing WebWorkers in any implementation other than Blink.
// Firefox's seems to have weird edge cases causing Mocha to error out
// early, and I need some standard to code to.
if (process.browser) {
  var ua = uaParser(navigator.userAgent);
  if (ua.browser.name === 'Chrome' && ua.os.name !== 'Android') {
    implementations.push('worker');
  }
} else {
  // Shim for XHR in order to test in Node (nice for coverage reports)
  global.XMLHttpRequest = require('./xhr-shim');
}

// Test both the worker and pseudoworker to ensure equivalent implementations.
implementations.forEach(function (workerType) {

  function createWorker(script) {
    return workerType === 'worker' ?
      new Worker(script) : new PseudoWorker(script);
  }

  describe(workerType + ': listener style', function () {

    this.timeout(5000);

    function workerPromise(script, toSend) {
      return Promise.resolve().then(function () {
        return createWorker(script);
      }).then(function (worker) {
        return new Promise(function (resolve, reject) {
          worker.addEventListener('message', function (e) {
            resolve(e.data);
            worker.terminate();
          });
          worker.addEventListener('error', function (e) {
            reject(e);
            worker.terminate();
          });
          worker.postMessage(toSend);
        });
      });
    }

    it('test basic', function () {
      var workerScript = 'test/listener-style/basic-worker.js';
      return workerPromise(workerScript, {}).then(function (data) {
        data.hello.should.equal('world');
      });
    });

    it('test invalid script', function () {
      var workerScript = 'test/listener-style/404.js';
      return workerPromise(workerScript, {}).then(function () {
        throw new Error('expected an error');
      }, function (e) {
        should.exist(e);
        e.type.should.equal('error');
      });
    });

    it('echoes correctly', function () {
      var obj = {hello: {world: 'yo'}};
      var workerScript = 'test/listener-style/echo-worker.js';
      return workerPromise(workerScript, obj).then(function (data) {
        data.should.deep.equal(obj);
      });
    });

    it('errors correctly', function () {
      var workerScript = 'test/listener-style/error-worker.js';
      return workerPromise(workerScript, null).then(function () {
        throw new Error('expected an error');
      }, function (e) {
        e.type.should.equal('error');
        e.message.should.be.a('string');
      });
    });

    it('errors on undefined postMessage()', function () {
      var worker = createWorker('test/listener-style/echo-worker.js');
      return Promise.resolve().then(function () {
        worker.postMessage();
      }).then(function () {
        throw new Error('expected an error');
      }, function (e) {
        should.exist(e);
        worker.terminate();
      });
    });

    it('emits multiple things', function () {
      var worker = createWorker('test/listener-style/echo-worker.js');
      return new Promise(function (resolve) {
        var count = 0;
        worker.addEventListener('message', function () {
          if (++count === 3) {
            resolve();
          }
        });
        worker.postMessage(null);
        worker.postMessage(null);
        worker.postMessage(null);
      }).then(function () {
        worker.terminate();
      });
    });

    it('emits multiple things and errors', function () {
      var worker = createWorker('test/listener-style/echo-and-error-worker.js');
      return new Promise(function (resolve, reject) {
        var count = 0;
        worker.addEventListener('message', function () {
          count++;
          if (count === 3) {
            worker.postMessage({error: true});
          }
        });
        worker.addEventListener('error', function () {
          if (count === 3) {
            resolve();
          } else {
            reject();
          }
        });
        worker.postMessage({error: false});
        worker.postMessage({error: false});
        worker.postMessage({error: false});
      }).then(function () {
        worker.terminate();
      });
    });

    it('does nothing after termination', function () {
      var worker = createWorker('test/listener-style/echo-worker.js');
      return new Promise(function (resolve, reject) {
        var count = 0;
        worker.addEventListener('message', function () {
          count++;
          if (count === 1) {
            worker.terminate();
            worker.postMessage({});
            setTimeout(resolve, 1000); // prove a negative
          } else {
            reject();
          }
        });
        worker.addEventListener('error', function (err) {
          reject(err);
        });
        worker.postMessage({});
      });
    });

    it('error listener inside worker itself', function () {
      var worker = createWorker('test/listener-style/error-listener-worker.js');
      return new Promise(function (resolve) {

        var count = 0;

        function checkDone() {
          if (++count === 2) {
            resolve();
          }
        }

        worker.addEventListener('message', function (e) {
          e.data.error.should.equal(true);
          checkDone();
        });

        worker.addEventListener('error', function (err) {
          should.exist(err);
          err.type.should.equal('error');
          err.message.should.be.a('string');
          checkDone();
        });

        worker.postMessage({});
      }).then(function () {
        worker.terminate();
      });
    });

    it('multiple listeners', function () {
      var worker = createWorker('test/listener-style/echo-worker.js');
      return new Promise(function (resolve) {

        var count = 0;

        function checkDone() {
          if (++count === 2) {
            resolve();
          }
        }

        worker.addEventListener('message', function () {
          checkDone();
        });

        worker.addEventListener('message', function () {
          checkDone();
        });

        worker.postMessage({});
      }).then(function () {
        worker.terminate();
      });
    });

    it('multiple listeners in worker', function () {
      var worker = createWorker('test/listener-style/echo-twice-worker.js');
      return new Promise(function (resolve) {

        var count = 0;

        function checkDone() {
          if (++count === 2) {
            resolve();
          }
        }

        worker.addEventListener('message', function () {
          checkDone();
        });

        worker.postMessage({});
      }).then(function () {
        worker.terminate();
      });
    });
  });

  describe(workerType + ': onmessage style', function () {

    this.timeout(5000);

    function workerPromise(script, toSend) {
      return Promise.resolve().then(function () {
        return createWorker(script);
      }).then(function (worker) {
        return new Promise(function (resolve, reject) {
          worker.onmessage = function (e) {
            resolve(e.data);
            worker.terminate();
          };
          worker.onerror = function (e) {
            reject(e);
            worker.terminate();
          };
          worker.postMessage(toSend);
        });
      });
    }

    it('test basic', function () {
      var workerScript = 'test/onmessage-style/basic-worker.js';
      return workerPromise(workerScript, {}).then(function (data) {
        data.hello.should.equal('world');
      });
    });

    it('test invalid script', function () {
      var workerScript = 'test/onmessage-style/404.js';
      return workerPromise(workerScript, {}).then(function () {
        throw new Error('expected an error');
      }, function (e) {
        should.exist(e);
        e.type.should.equal('error');
      });
    });

    it('echoes correctly', function () {
      var obj = {hello: {world: 'yo'}};
      var workerScript = 'test/onmessage-style/echo-worker.js';
      return workerPromise(workerScript, obj).then(function (data) {
        data.should.deep.equal(obj);
      });
    });

    it('errors correctly', function () {
      var workerScript = 'test/onmessage-style/error-worker.js';
      return workerPromise(workerScript, null).then(function () {
        throw new Error('expected an error');
      }, function (e) {
        e.type.should.equal('error');
        e.message.should.be.a('string');
      });
    });

    it('emits multiple things', function () {
      var worker = createWorker('test/onmessage-style/echo-worker.js');
      return new Promise(function (resolve) {
        var count = 0;
        worker.onmessage = function () {
          if (++count === 3) {
            resolve();
          }
        };
        worker.postMessage(null);
        worker.postMessage(null);
        worker.postMessage(null);
      }).then(function () {
        worker.terminate();
      });
    });

    it('emits multiple things and errors', function () {
      var workerScript = 'test/onmessage-style/echo-and-error-worker.js';
      var worker = createWorker(workerScript);
      return new Promise(function (resolve, reject) {
        var count = 0;
        worker.onmessage = function () {
          count++;
          if (count === 3) {
            worker.postMessage({error: true});
          }
        };
        worker.onerror = function () {
          if (count === 3) {
            resolve();
          } else {
            reject();
          }
        };
        worker.postMessage({error: false});
        worker.postMessage({error: false});
        worker.postMessage({error: false});
      }).then(function () {
        worker.terminate();
      });
    });

    it('does nothing after termination', function () {
      var worker = createWorker('test/onmessage-style/echo-worker.js');
      return new Promise(function (resolve, reject) {
        var count = 0;
        worker.onmessage = function () {
          count++;
          if (count === 1) {
            worker.terminate();
            worker.postMessage({});
            setTimeout(resolve, 1000); // prove a negative
          } else {
            reject();
          }
        };
        worker.onerror = function (err) {
          reject(err);
        };
        worker.postMessage({});
      });
    });

    it('error listener inside worker itself', function () {
      var workerScript = 'test/onmessage-style/error-listener-worker.js';
      var worker = createWorker(workerScript);
      return new Promise(function (resolve) {

        var count = 0;

        function checkDone() {
          if (++count === 2) {
            resolve();
          }
        }

        worker.onmessage = function (e) {
          e.data.error.should.equal(true);
          checkDone();
        };

        worker.onerror = function (err) {
          should.exist(err);
          err.type.should.equal('error');
          err.message.should.be.a('string');
          checkDone();
        };

        worker.postMessage({});
      }).then(function () {
        worker.terminate();
      });
    });

    it('multiple listeners', function () {
      var worker = createWorker('test/onmessage-style/echo-worker.js');
      return new Promise(function (resolve) {

        var count = 0;

        function checkDone() {
          if (++count === 2) {
            resolve();
          }
        }

        worker.onmessage = function () {
          checkDone();
        };

        worker.addEventListener('message', function () {
          checkDone();
        });

        worker.postMessage({});
      }).then(function () {
        worker.terminate();
      });
    });

    it('multiple listeners in worker', function () {
      var worker = createWorker('test/onmessage-style/echo-twice-worker.js');
      return new Promise(function (resolve) {

        var count = 0;

        function checkDone() {
          if (++count === 2) {
            resolve();
          }
        }

        worker.onmessage = function () {
          checkDone();
        };

        worker.postMessage({});
      }).then(function () {
        worker.terminate();
      });
    });

  });

});