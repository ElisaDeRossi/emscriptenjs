import FileSystem from "./modules/FileSystem.mjs";
import { QuickNodeProcess, Python3Process, LlvmBoxProcess, BinaryenBoxProcess } from "./modules/Processes.mjs";
import { lazyCacheArray, rootPackArray } from "./modules/fileArrays.mjs";
import { EventEmitter } from 'events';

export default class Emscriptenjs extends EventEmitter {
    
    fileSystem = null;
    tools = {};

    async init() {

        const baseUrl = window.location.protocol + '//' + window.location.host + '/static_lib';

        // Initialize filesystem
        const fileSystem = await new FileSystem();
        this.fileSystem = fileSystem;
        await fileSystem.cachedLazyFile(...rootPackArray, `${baseUrl}/root_pack${rootPackArray[0]}`);
        await fileSystem.unpack(rootPackArray[0]);

        // Populate the emscripten cache
        for (const [relpath, size, md5] of lazyCacheArray) {
            const path = `/emscripten/${relpath.slice(2)}`;
            await fileSystem.cachedLazyFile(path, size, md5, `${baseUrl}/lazy_cache/${md5}.a`);
        }

        if (fileSystem.exists("/emscripten/cache/cache.lock")) {
            fileSystem.unlink("/emscripten/cache/cache.lock");
        }

        // Tools configuration variables (filesystem and onrunprocess function)
        const processConfig = {
            FS: fileSystem.FS,
            onrunprocess: (...args) => this.run_process(...args),
        };

        // Tools initialization
        const tools = {
            "llvm-box": new LlvmBoxProcess(processConfig),          // LLVM compiler
            "binaryen-box": new BinaryenBoxProcess(processConfig),  // creation and optimization of wasm modules
            "node": new QuickNodeProcess(processConfig),            // Node environment
            "python": new Python3Process(processConfig),            // Python 3
            "main-python": new Python3Process(processConfig),
        };
        this.tools = tools;

        for (let tool in tools) {
            await tools[tool];
        }
    }

    // Runs compilation of c/c++ code
    compile(...args) {
        if (args.length == 1) args = args[0].split(/ +/);
        args = [
            "/usr/bin/python",
            "-E",
            `/emscripten/${args[0]}.py`,
            ...args.slice(1)
        ];
        let result = this.tools["main-python"].exec(args, {
            print:    (...args) => { 
                this.emit('compilationStdout', args);
            },
            printErr: (...args) => { 
                this.emit('compilationStderr', args[0]);
            },
            cwd: "/working",
            path: ["/emscripten"],
        });
        return result;
    }

    // Execute process
    async execute() {
        const content = await this.fileSystem.readFile("/working/main.js", { encoding: "utf8" });
        // eslint-disable-next-line
        const funct = new Function(content);

        // Override console.log function
        const originalLog = console.log;
        console.log = (message) => {
            this.emit('executionStdout', message);
        };

        // Override console.error function
        const originalError = console.error;
        console.error = (message) => {
            this.emit('executionStderr', message);
        };

        // Override prompt function
        const originalPrompt = window.prompt;
        window.prompt = (message, def) => {
            this.emit('executionStdin', message, def);
        };
        
        // Execute function
        funct();

        // Restore original functions
        console.log = originalLog;
        console.error = originalError;
        window.prompt = originalPrompt;
    }

    // On run process function
    run_process(argv, opts = {}) {
        const in_emscripten = argv[0].match(/\/emscripten\/(.+)(\.py)?/)
        if (in_emscripten) {
            argv = [
                "/usr/bin/python",
                "-E",
                `/emscripten/${in_emscripten[1]}.py`,
                ...args.slice(1)
            ];
        }

        if (!this.fileSystem.exists(argv[0])) {
            const result = {
                returncode: 1,
                stdout: "",
                stderr: `Executable not found: ${JSON.stringify(argv[0])}`,
            };
            return result;
        }

        const tool_info = argv[0] === "/usr/bin/python" ? "python" : this.fileSystem.readFile(argv[0], {encoding: "utf8"});
        const [tool_name, ...extra_args] = tool_info.split(";")

        if (!(tool_name in this.tools)) {
            const result = {
                returncode: 1,
                stdout: "",
                stderr: `File is not executable: ${JSON.stringify(argv[0])}`,
            };
            return result;
        }

        argv = [...extra_args, ...argv];
  
        const tool = this.tools[tool_name];
        const result = tool.exec(argv, {
            ...opts,
            cwd: opts.cwd || "/",
            path: ["/emscripten"]
        });
        this.fileSystem.push();

        // PROVA
        // Emit events for standard output and standard error
        /*
        result.stdout.on('data', (data) => {
            this.emit('executionStdout', data.toString());
        });

        result.stderr.on('data', (data) => {
            this.emit('executionStderr', data.toString());
        });
        */
        // END PROVA

        return result;
    }
};
