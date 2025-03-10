/*
* port.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import * as ld from "./lodash.ts";

import { randomInt } from "./random.ts";

export const kLocalhost = "127.0.0.1";

const kMinPort = 3000;
const kMaxPort = 8000;

export function findOpenPort(defaultPort?: number): number {
  defaultPort = defaultPort || randomInt(kMinPort, kMaxPort);
  if (isPortAvailableSync({ port: defaultPort, hostname: kLocalhost })) {
    return defaultPort;
  } else {
    let ports = new Array<number>(kMaxPort - kMinPort);
    for (let i = 0; i < ports.length; i++) {
      ports[i] = kMinPort + i;
    }
    ports = ld.shuffle(ports);
    while (true) {
      const port = getAvailablePortSync({
        port: ports,
        hostname: kLocalhost,
      });
      if (port === undefined) {
        throw new Error("Unabled to find open port for serve");
      }
      // don't use ports considered unsafe by chrome
      if (
        ![3659, 4045, 6000, 6665, 6666, 6667, 6668, 6669, 6697].includes(
          port,
        )
      ) {
        return port;
      }
    }
  }
}

// forked from https://github.com/piyush-bhatt/deno-port b/c it became
// incompatible with updates to deno std library updating from 0.97 to 0.117

interface IPortRange {
  start: number;
  end: number;
}

interface IListenerOptions {
  port: number;
  hostname?: string;
  transport?: "tcp";
}

interface IOptions {
  port?: number[] | IPortRange;
  hostname?: string;
  transport?: "tcp";
}

/**
 * Checks if a port is available
 * Requires `--allow-net` flag
 * @param options
 */
export function isPortAvailableSync(options: IListenerOptions): boolean {
  try {
    const listener = Deno.listen({
      port: options.port,
      ...(options.hostname ? { hostname: options.hostname } : {}),
      ...(options.transport ? { transport: options.transport } : {}),
    });
    listener.close();
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.AddrInUse) {
      return false;
    }
    throw error;
  }
}

/**
 * Finds a free port based on the options
 * Requires `--allow-net` flag
 * @param options
 */
export function getAvailablePortSync(
  options: IOptions = { transport: "tcp" },
): number | undefined {
  if (options.port === undefined) {
    return getRandomPortSync(options);
  } else if (Array.isArray(options.port)) {
    const portList = options.port;
    for (let i = 0; i < portList.length; i++) {
      if (withinRange(portList[i])) {
        const portAvailable = isPortAvailableSync({
          port: portList[i],
          ...(options.hostname ? { hostname: options.hostname } : {}),
          ...(options.transport ? { transport: options.transport } : {}),
        });
        if (portAvailable) {
          return portList[i];
        } else {
          continue;
        }
      } else {
        continue;
      }
    }
  } else if (
    options.port.start !== undefined &&
    options.port.end !== undefined
  ) {
    const start = options.port.start;
    const end = options.port.end;
    if (start >= 0 && end <= 65535 && start <= end) {
      for (let p = start; p <= end; p++) {
        const portAvailable = isPortAvailableSync({
          port: p,
          ...(options.hostname ? { hostname: options.hostname } : {}),
          ...(options.transport ? { transport: options.transport } : {}),
        });
        if (portAvailable) {
          return p;
        } else {
          continue;
        }
      }
    } else {
      throw new Error(
        "Range should be between 0 - 65535 and start should be less than end",
      );
    }
  }
}

/**
 * Finds a random available port in range 0-65535
 * @param options
 */
function getRandomPortSync(options: IOptions): number {
  const randomPort = random(0, 65535);
  if (
    isPortAvailableSync({
      port: randomPort,
      ...(options.hostname ? { hostname: options.hostname } : {}),
      ...(options.transport ? { transport: options.transport } : {}),
    })
  ) {
    return randomPort;
  } else {
    return getRandomPortSync(options);
  }
}

/**
 * Finds a random number between the given range
 * @param min
 * @param max
 */
function random(min: number, max: number): number {
  return Math.round(Math.random() * (max - min)) + min;
}

/**
 * Checks if the given port is within range of 0-65535
 * @param port
 */
function withinRange(port: number): boolean {
  return port >= 0 && port <= 65535;
}
