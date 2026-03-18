$.terminal.xml_formatter.tags.red = (attrs) => "[[;#FF2929;]";
$.terminal.xml_formatter.tags.green = (attrs) => "[[;#29FF29;]";

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
    term.echo(`<red>command not found: ${name}</red>`);
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

  return `<green>${user}@portfolio:${path}$ </green>`;
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

function printFile(path) {
  const target = resolvePath(path);
  const targetStr = target.join("/");
  const node = getNode(target);

  if (!node) {
    term.echo(`<red>not found: ${targetStr}</red>`);
    return;
  }

  if (node.type !== "file") {
    term.echo(`<red>not a file: ${targetStr}</red>`);
    return;
  }

  term.echo(node.content);
  return;
}

const commands = [
  new Command({
    name: "help",
    help: "Lists all available commands",
    man: `<bold>NAME</bold>
  help - lists all available commands

<bold>SYNOPSIS</bold>
  help

<bold>DESCRIPTION</bold>
  Displays a list of all available commands
  along with a short description for each.

<bold>SEE ALSO</bold>
  man - display the manual page for a command`,
    run() {
      printFile("~/help.txt");
    },
  }),

  new Command({
    name: "man",
    help: "Displays the manual page for a command",
    man: `<bold>NAME</bold>
  man - displays the manual page for a command

<bold>SYNOPSIS</bold>
  man COMMAND

<bold>DESCRIPTION</bold>
  Displays the manual page for the specified command.

<bold>SEE ALSO</bold>
  help - list all available commands`,
    run([name]) {
      const cmd = registry.get(name);

      if (!cmd) {
        term.echo(`<red>usage: man COMMAND</red>`);
        return;
      }
      printFile(`~/manuals/${cmd.name}.txt`);
    },
  }),

  new Command({
    name: "ls",
    help: "Lists directory contents horizontally",
    man: `<bold>NAME</bold>
  ls - lists directory contents horizontally

<bold>SYNOPSIS</bold>
  ls

<bold>DESCRIPTION</bold>
  Lists the contents of the current directory horizontally.

<bold>SEE ALSO</bold>
  ll - list directory contents vertically
  tree - prints directory tree`,
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
    help: "Lists directory contents vertically",
    man: `<bold>NAME</bold>
  ll - lists directory contents vertically

<bold>SYNOPSIS</bold>
  ll

<bold>DESCRIPTION</bold>
  Lists the contents of the current directory vertically.

<bold>SEE ALSO</bold>
  ls - list directory contents horizontally
  tree - prints directory tree`,
    run() {
      const dir = getNode(cwd);

      Object.keys(dir.children).forEach((name) => {
        const child = dir.children[name];
        term.echo(`${name}${child.type === "dir" ? "/" : ""}`);
      });
    },
  }),

  new Command({
    name: "tree",
    help: "Prints directory tree",
    man: `<bold>NAME</bold>
  tree - prints directory tree

<bold>SYNOPSIS</bold>
  tree DIRECTORY

<bold>DESCRIPTION</bold>
  Recursively lists the contents of a directory in a tree-likeformat.

<bold>SEE ALSO</bold>
  ls - list directory contents horizontally
  ll - list directory contents vertically`,
    run([path = ""]) {
      const target = resolvePath(path);
      const targetStr = target.join("/");
      const node = getNode(target);

      if (!node) {
        term.echo(`<red>does not exist: ${targetStr}</red>`);
        return;
      }

      if (node.type !== "dir") {
        term.echo(`<red>not a directory: ${targetStr}</red>`);
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
    name: "pwd",
    help: "Prints working directory",
    man: `<bold>NAME</bold>
  pwd - prints working directory

<bold>SYNOPSIS</bold>
  pwd

<bold>DESCRIPTION</bold>
  Prints the absolute path of the current working directory.`,
    run() {
      term.echo("/" + cwd.join("/"));
    },
  }),

  new Command({
    name: "cd",
    help: "Changes directory",
    man: `<bold>NAME</bold>
  cd - changes directory

<bold>SYNOPSIS</bold>
  cd DIRECTORY

<bold>DESCRIPTION</bold>
  Changes the current working directory.`,
    run([path = "~"]) {
      const target = resolvePath(path);
      const targetStr = target.join("/");
      const node = getNode(target);

      if (!node) {
        term.echo(`<red>does not exist: ${targetStr}</red>`);
        return;
      }

      if (node.type !== "dir") {
        term.echo(`<red>not a directory: ${targetStr}</red>`);
        return;
      }

      cwd = target;
    },
  }),

  new Command({
    name: "cat",
    help: "Prints file contents",
    man: `<bold>NAME</bold>
  cat - prints file contents

<bold>SYNOPSIS</bold>
  cat FILE

<bold>DESCRIPTION</bold>
  Prints the contents of the specified file to the terminal.`,
    run([path]) {
      printFile(path);
    },
  }),
];

commands.forEach(registerCommand);

generateDocs();
