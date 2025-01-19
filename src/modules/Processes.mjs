import EmProcess from "./EmProcess.mjs";

import QuickNodeModule from "./dependencies/quicknode/quicknode.mjs";
import PythonModule from "./dependencies/cpython/python.mjs";
import LlvmBoxModule from "./dependencies/llvm/llvm-box.mjs";
import BinaryenBoxModule from "./dependencies/binaryen/binaryen-box.mjs";
import BrotliModule from "./dependencies/brotli/brotli.mjs";
import WasmPackageModule from "./dependencies/wasm-package/wasm-package.mjs";

export class QuickNodeProcess extends EmProcess {
    constructor(opts) {
        const wasmBinary = opts.FS.readFile("/wasm/quicknode.wasm");
        super(QuickNodeModule, { ...opts, wasmBinary });
    }
};

export class Python3Process extends EmProcess {
    constructor(opts) {
        const wasmBinary = opts.FS.readFile("/wasm/python.wasm");
        super(PythonModule, { ...opts, wasmBinary });
    }
};

export class LlvmBoxProcess extends EmProcess {
    constructor(opts) {
        const wasmBinary = opts.FS.readFile("/wasm/llvm-box.wasm");
        super(LlvmBoxModule, { ...opts, wasmBinary });
    }
};

export class BinaryenBoxProcess extends EmProcess {
    constructor(opts) {
        const wasmBinary = opts.FS.readFile("/wasm/binaryen-box.wasm");
        super(BinaryenBoxModule, { ...opts, wasmBinary });
    }
};

export class BrotliProcess extends EmProcess {
    constructor(opts) {
        super(BrotliModule, { ...opts });
    }
};

export class WasmPackageProcess extends EmProcess {
    constructor(opts) {
        super(WasmPackageModule, { ...opts });
    }
};
