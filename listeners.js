const encoder = new TextEncoder();

class EventListener {
    /** @type {string} */
    #id = "";
    /** @type {ReadableStream | undefined} */
    #stream = undefined;
    /** @type {ReadableStreamDefaultController} */
    #controller = undefined;

    /**
     * @param {string} id 
     */
    constructor (id) {
        this.#id = id;
    }

    getId () {
        return this.#id;
    }

    /**
     * @param {(() => void) | (() => Promise<void>)} onClose 
     */
    makeResponse (onClose) {
        this.#stream = new ReadableStream({
            start: (ctl) => {
                this.#controller = ctl;
                this.#sendRaw(":connected\r\n\r\n");
            },
            cancel: async () => {
                const rst = onClose();
                if (rst instanceof Promise) {
                    await rst;
                }
            },
        });
        return new Response(this.#stream, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "text/event-stream",
            },
        });
    }

    /**
     * @param {string} text 
     */
    #sendRaw (text) {
        if (this.#controller != undefined) {
            this.#controller.enqueue(encoder.encode(text));
        }
    }

    pingKeeplive () {
        this.#sendRaw(":ping\r\n\r\n");
    }

    close () {
        if (this.#stream != undefined) {
            this.#controller.close();
            this.#controller = undefined;
            this.#stream = undefined;
        }
    }

    /**
     * @param {string | undefined} event 
     * @param {string} data 
     */
    emitEvent (event, data) {
        if (event) {
            this.#sendRaw(`event: ${event}\r\n`);
        }
        data.split("\n").forEach((line) => {
            this.#sendRaw(`data: ${line.trimEnd()}\r\n`);
        })
        this.#sendRaw("\r\n");
    }
}

/** @type {Map<string, EventListener>} */
const listeners = new Map();

/**
 * @param {string} uid 
 */
const unregisterListener = (uid) => {
    if (listeners.has(uid)) {
        listeners.delete(uid);
    }
};

/**
 * @param {string} uid 
 * @returns {Response | undefined}
 */
export const startListen = (uid) => {
    if (listeners.has(uid)) {
        return undefined;
    }
    const lst = new EventListener(uid);
    listeners.set(uid, lst);
    return lst.makeResponse(() => {
        unregisterListener(uid);
    });
};

/**
 * @param {string} uid 
 * @returns {boolean}
 */
export const pingListener = (uid) => {
    if (listeners.has(uid)) {
        listeners.get(uid).pingKeeplive();
        return true;
    }
    return false;
};

/**
 * @param {string} uid 
 * @param {string | undefined} event 
 * @param {string} data 
 * @returns {boolean}
 */
export const emitEvent = (uid, event, data) => {
    if (listeners.has(uid)) {
        listeners.get(uid).emitEvent(event, data);
        return true;
    }
    return false;
};

export const startKeepliveTask = () => {
    // init task
    const task = () => {
        for (const lst of listeners.values()) {
            try {
                lst.pingKeeplive();
            } catch {
                // CONTINUE IGNORE ERROR
            }
        }
    };
    setInterval(task, 14 * 1000);
};
