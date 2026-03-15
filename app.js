class Command {
  constructor({ name, help = "", man = "", aliases = [], run }) {
    this.name = name;
    this.help = help;
    this.man = man;
    this.aliases = aliases;
    this.run = run;
  }
}

const registry = new Map();

function registerCommand(cmd) {
  registry.set(cmd.name, cmd);

  for (const alias of cmd.aliases) {
    registry.set(alias, cmd);
  }
}

function dispatch(input) {
  const [name, ...args] = input.trim().split(/\s+/);

  if (!name) return;

  const cmd = registry.get(name);

  if (!cmd) {
    term.error(`command not found: ${name}`);
    return;
  }

  cmd.run(args);
}

function completion() {
  const parts = this.get_command().split(/\s+/);

  if (parts.length <= 1) {
    const partial = parts[0] || "";
    const commands = Array.from(registry.keys())
      .filter((cmd) => cmd.startsWith(partial))
      .sort();

    return [...new Set(commands)];
  }

  if (parts.length >= 2) {
    const partial = parts[parts.length - 1] || "";

    let searchPath;
    let searchPrefix;

    if (partial.startsWith("~")) {
      const homePath = ["home", user];
      const afterTilde = partial.slice(1);

      if (afterTilde === "" || afterTilde === "/") {
        searchPath = homePath;
        searchPrefix = "~/";
      } else {
        const tildeParts = afterTilde.split("/").filter(Boolean);
        searchPath = [...homePath, ...tildeParts.slice(0, -1)];
        searchPrefix =
          "~/" +
          (tildeParts.slice(0, -1).length > 0
            ? tildeParts.slice(0, -1).join("/") + "/"
            : "");
      }
    } else if (partial.startsWith("/")) {
      const absoluteParts = partial.split("/").filter(Boolean);
      searchPath = absoluteParts.slice(0, -1);
      searchPrefix =
        "/" + (searchPath.length > 0 ? searchPath.join("/") + "/" : "");
    } else {
      const relativeParts = partial.split("/").filter(Boolean);
      searchPath = [...cwd, ...relativeParts.slice(0, -1)];
      searchPrefix =
        relativeParts.slice(0, -1).length > 0
          ? relativeParts.slice(0, -1).join("/") + "/"
          : "";
    }

    const partialName = partial.split("/").pop() || "";

    const dirNode = getNode(searchPath);
    if (!dirNode || dirNode.type !== "dir") {
      return [];
    }

    const matches = Object.keys(dirNode.children)
      .filter((name) => name.startsWith(partialName))
      .map((name) => {
        const child = dirNode.children[name];
        return name + (child.type === "dir" ? "/" : "");
      })
      .sort();

    if (matches.length === 1 && matches[0].endsWith("/")) {
      return [searchPrefix + matches[0]];
    }

    return matches.map((match) => searchPrefix + match);
  }

  return [];
}

let user = "guest";
let cwd = ["home", user];

function prompt() {
  let path = "/" + cwd.join("/");

  if (path === `/home/${user}`) {
    path = "~";
  } else if (path.startsWith(`/home/${user}`)) {
    path = "~" + path.slice(`/home/${user}`.length);
  }

  return `[[;green;]${user}@portfolio:${path}$ ]`;
}

const term = $("body").terminal(dispatch, {
  exit: false,
  greetings: false,
  completion,
  prompt,
});

function generateManContent(cmd) {
  return cmd.man || `No manual entry for ${cmd.name}`;
}

function generateHelpContent() {
  let text = "";

  registry.forEach((cmd) => {
    text +=
      text === ""
        ? `${cmd.name.padEnd(10)} ${cmd.help}`
        : `\n${cmd.name.padEnd(10)} ${cmd.help}`;
  });

  return text;
}

function generateDocs() {
  const home = fileSystem.children.home.children.guest;

  registry.forEach((cmd, name) => {
    if (name === cmd.name) {
      home.children.manuals.children[`${cmd.name}.txt`] = {
        type: "file",
        content: generateManContent(cmd),
      };
    }
  });

  home.children["help.txt"] = {
    type: "file",
    content: generateHelpContent(),
  };
}

const fileSystem = {
  type: "dir",
  children: {
    home: {
      type: "dir",
      children: {
        guest: {
          type: "dir",
          children: {
            "help.txt": {
              type: "file",
              children: {},
            },
            manuals: {
              type: "dir",
              children: {},
            },
          },
        },
      },
    },
  },
};

function resolvePath(path = "") {
  let parts = path.split("/").filter(Boolean);
  let current;

  if (path.startsWith("/")) {
    current = [];
  } else if (path.startsWith("~/")) {
    current = ["home", user];
    if (parts[0].startsWith("~")) parts.shift();
  } else if (path === "~") {
    current = ["home", user];
    return current;
  } else {
    current = [...cwd];
  }

  for (let p of parts) {
    if (p === "..") current.pop();
    else if (p !== ".") current.push(p);
  }

  return current;
}

function getNode(pathArray) {
  let node = fileSystem;

  for (let part of pathArray) {
    if (!node.children?.[part]) return null;
    node = node.children[part];
  }

  return node;
}

function walkPath(parts) {
  let node = fileSystem;
  let current = [];

  for (let part of parts) {
    current.push(part);

    if (!node.children[part]) {
      node.children[part] = { type: "dir", children: {} };
    } else if (node.children[part].type !== "dir") {
      term.error(`${current.join("/")} exists and is not a directory`);
      return;
    }

    node = node.children[part];
  }

  return node;
}

const commands = [
  new Command({
    name: "help",
    help: "List commands",
    man: `NAME
      help - list available commands

SYNOPSIS
      help

DESCRIPTION
      Displays a list of available commands along with a short
      description of each command.`,
    run() {
      registry.get("cat").run(["~/help.txt"]);
    },
  }),

  new Command({
    name: "man",
    help: "Show command manual",
    man: `NAME
      man - display manual pages for commands

SYNOPSIS
      man [command]

DESCRIPTION
      Displays the manual page for the specified command.
      Manual pages provide detailed documentation about a command,
      including usage, description, and options.

SEE ALSO
      help`,
    run([name]) {
      const cmd = registry.get(name);

      if (!cmd) {
        term.error(`usage: man <command>`);
        return;
      }
      registry.get("cat").run([`~/manuals/${cmd.name}.txt`]);
    },
  }),

  new Command({
    name: "ls",
    help: "List directory contents",
    man: `NAME
      ls - list directory contents

SYNOPSIS
      ls

DESCRIPTION
      Lists the contents of the current working directory.
      Files and directories are printed in a single line separated
      by spaces. Directories are indicated by a trailing '/'.`,
    run() {
      const dir = getNode(cwd);

      const names = Object.keys(dir.children).map((name) => {
        const child = dir.children[name];
        return child.type === "dir" ? name + "/" : name;
      });

      term.echo(names.join(" "));
    },
  }),

  new Command({
    name: "ll",
    help: "List directory contents (one per line)",
    man: `NAME
      ll - list directory contents one per line

SYNOPSIS
      ll

DESCRIPTION
      Lists the contents of the current directory with one entry
      per line. Directories are indicated by a trailing '/'.`,
    run() {
      const dir = getNode(cwd);

      Object.keys(dir.children).forEach((name) => {
        const child = dir.children[name];
        term.echo(`${name}${child.type === "dir" ? "/" : ""}`);
      });
    },
  }),

  new Command({
    name: "pwd",
    help: "Print working directory",
    man: `NAME
      pwd - print working directory

SYNOPSIS
      pwd

DESCRIPTION
      Prints the absolute path of the current working directory.`,
    run() {
      term.echo("/" + cwd.join("/"));
    },
  }),

  new Command({
    name: "tree",
    help: "Display directory tree",
    man: `NAME
      tree - display directory tree

SYNOPSIS
      tree [directory]

DESCRIPTION
      Recursively lists the contents of a directory in a tree-like
      format. If no directory is specified, the current directory
      is used. Directories are shown with a trailing '/'.`,
    run([path = ""]) {
      const target = resolvePath(path);
      const node = getNode(target);

      if (!node) {
        term.error(`${target.join("/")} does not exist`);
        return;
      }

      if (node.type !== "dir") {
        term.error(`${target.join("/")} is not a directory`);
        return;
      }

      function walk(node, prefix = "") {
        const names = Object.keys(node.children);
        names.forEach((name, i) => {
          const child = node.children[name];
          const last = i === names.length - 1;
          const pointer = last ? "└── " : "├── ";

          term.echo(
            `${prefix}${pointer}${name}${child.type === "dir" ? "/" : ""}`,
          );

          if (child.type === "dir") {
            walk(child, prefix + (last ? "    " : "│   "));
          }
        });
      }

      function getTopName(target) {
        const cwdStr = cwd.join("/");
        const targetStr = target.join("/");

        if (target.length === 0) return "";

        if (target.length >= 2 && target[0] === "home" && target[1] === user) {
          const relToHome = target.slice(2).join("/");
          return relToHome ? `~/${relToHome}` : "~";
        }

        if (targetStr === cwdStr) return ".";

        if (targetStr.startsWith(cwdStr + "/")) {
          return "./" + targetStr.slice(cwdStr.length + 1);
        }

        return target[target.length - 1];
      }

      const topName = getTopName(target);
      term.echo(`${topName}/`);
      walk(node);
    },
  }),

  new Command({
    name: "cd",
    help: "Change directory",
    man: `NAME
      cd - change the working directory

SYNOPSIS
      cd [directory]

DESCRIPTION
      Changes the current working directory to the specified
      directory. If no directory is specified, the command
      changes to the user's home directory (~).`,
    run([path = "~"]) {
      const target = resolvePath(path);
      const node = getNode(target);

      if (!node) {
        term.error("directory does not exist");
        return;
      }

      if (node.type !== "dir") {
        term.error("not a directory");
        return;
      }

      cwd = target;
    },
  }),

  new Command({
    name: "mkdir",
    help: "Create directory",
    man: `NAME
      mkdir - create a new directory

SYNOPSIS
      mkdir directory

DESCRIPTION
      Creates a new directory at the specified path. Any
      intermediate directories that do not exist will be
      created automatically.`,
    run([path]) {
      if (!path) {
        term.error("mkdir: missing operand");
        return;
      }

      const parts = resolvePath(path);
      walkPath(parts);
    },
  }),

  new Command({
    name: "touch",
    help: "Create file",
    man: `NAME
      touch - create an empty file

SYNOPSIS
      touch file

DESCRIPTION
      Creates a new empty file at the specified path.`,
    run([path]) {
      const parts = resolvePath(path);
      const file = parts.pop();
      const dir = walkPath(parts);

      if (!dir.children[file]) {
        dir.children[file] = { type: "file", content: "" };
      } else {
        term.error(`${path} already exists`);
      }
    },
  }),

  new Command({
    name: "cat",
    help: "Show file contents",
    man: `NAME
      cat - display file contents

SYNOPSIS
      cat file

DESCRIPTION
      Prints the contents of the specified file to the terminal.`,
    run([path]) {
      const target = resolvePath(path);
      const node = getNode(target);

      if (!node) {
        term.error("file not found");
        return;
      }

      if (node.type !== "file") {
        term.error("not a file");
        return;
      }

      term.echo(node.content);
    },
  }),

  new Command({
    name: "rm",
    help: "Remove file or directory",
    man: `NAME
      rm - remove files or directories

SYNOPSIS
      rm path

DESCRIPTION
      Removes the specified file or directory.`,
    run([name]) {
      const parts = resolvePath(name);
      const file = parts.pop();
      const dir = getNode(parts);

      if (!dir?.children[file]) {
        term.error("not found");
        return;
      }

      delete dir.children[file];
    },
  }),
];

commands.forEach(registerCommand);

generateDocs();
