// Modified version of createLazyFile from Emscripten's FS
// https://github.com/emscripten-core/emscripten/blob/main/src/library_fs.js
export default async function createLazyFile(FS, parent, name, datalength, url, canRead, canWrite, onloaded) {

    // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
    class LazyUint8Array {

        constructor() {
            this.lengthKnown = false;
            this.length = 0;
            this.content = null; // Loaded content.
        }

        async doXHR() {
            return await new Promise((resolve, reject) => {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true); // Set to true for asynchronous

                // Some hints to the browser that we want binary data.
                xhr.responseType = 'arraybuffer';
                if (xhr.overrideMimeType) {
                    xhr.overrideMimeType('text/plain; charset=x-user-defined');
                }

                // Set up the onload event handler
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 304) {
                        if (xhr.response !== undefined) {
                            this.content = new Uint8Array(xhr.response || []);
                        }
                        else {
                            this.content = this.intArrayFromString(xhr.responseText || '', true);
                        }
                        this.length = datalength;
                        this.lengthKnown = true;
                        resolve();
                    } else {
                        reject(new Error("Couldn't load " + url + ". Status: " + xhr.status));
                    }
                };

                // Set up the onerror event handler
                xhr.onerror = () => {
                    // console.error("Request failed");
                    reject(new Error("Couldn't load " + url + ". Request failed."));
                };

                // Send the request
                xhr.send(null);
            });
        }

        intArrayFromString(stringy, dontAddNull, length) {
            var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
            var u8array = new Array(len);
            var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
            if (dontAddNull) u8array.length = numBytesWritten;
            return u8array;
        }
    }

    return new Promise(async (resolve) => {
        if (typeof XMLHttpRequest === 'undefined') {
            throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers.';
        }

        var lazyArray = new LazyUint8Array();
        await lazyArray.doXHR();
        await onloaded(lazyArray.content);
        var properties = { isDevice: false, contents: lazyArray };

        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        node.contents = lazyArray;

        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
            usedBytes: {
                get: /** @this {FSNode} */ function () { return this.contents.length; }
            }
        });

        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach((key) => {
            var fn = node.stream_ops[key];
            stream_ops[key] = function forceLoadLazyFile() {
                FS.forceLoadFile(node);
                return fn.apply(null, arguments);
            };
        });
        function writeChunks(stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= contents.length)
                return 0;
            var size = Math.min(contents.length - position, length);
            var data = contents.content; // LazyUint8Array from sync binary XHR
            for (var i = 0; i < size; i++) {
                buffer[offset + i] = data[position + i];
            }
            return size;
        }

        // use a custom read function
        stream_ops.read = (stream, buffer, offset, length, position) => {
            FS.forceLoadFile(node);
            return writeChunks(stream, buffer, offset, length, position)
        };
        // use a custom mmap function
        stream_ops.mmap = (stream, length, position, prot, flags) => {
            FS.forceLoadFile(node);
            var ptr = mmapAlloc(length);
            if (!ptr) {
                const ENOMEM = 48;
                throw new FS.ErrnoError(ENOMEM);
            }
            writeChunks(stream, HEAP8, ptr, length, position);
            return { ptr: ptr, allocated: true };
        };

        node.stream_ops = stream_ops;

        resolve(node);
    });
}