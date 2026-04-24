/**
 * Generate shell completion scripts for bash, zsh, and fish.
 *
 * Usage:
 *   slideless completion bash         # print bash completion script
 *   slideless completion zsh          # print zsh completion script
 *   slideless completion fish         # print fish completion script
 *   slideless completion --install    # auto-detect shell and install
 *   slideless completion --uninstall  # remove installed completion
 */

import { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const BEGIN_MARKER = '# BEGIN slideless completion';
const END_MARKER = '# END slideless completion';

// ── Shell detection ──────────────────────────────────────

function detectShell(): 'bash' | 'zsh' | 'fish' | null {
  const shell = process.env.SHELL || '';
  if (shell.endsWith('/zsh') || shell.endsWith('/zsh5')) return 'zsh';
  if (shell.endsWith('/bash')) return 'bash';
  if (shell.endsWith('/fish')) return 'fish';
  return null;
}

function getRcFile(shell: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'bash':
      return join(homedir(), '.bashrc');
    case 'zsh':
      return join(homedir(), '.zshrc');
    case 'fish':
      return join(homedir(), '.config', 'fish', 'completions', 'slideless.fish');
  }
}

// ── Bash completion ──────────────────────────────────────

function generateBashCompletion(): string {
  return `# slideless bash completion
_slideless_completions() {
  local cur prev words cword
  _init_completion || return

  local cmd=""
  local subcmd=""
  for ((i=1; i < cword; i++)); do
    case "\${words[i]}" in
      -*) ;;
      *)
        if [[ -z "$cmd" ]]; then
          cmd="\${words[i]}"
        elif [[ -z "$subcmd" ]]; then
          subcmd="\${words[i]}"
        fi
        ;;
    esac
  done

  local commands="login logout whoami use profiles verify config share update list get completion"

  case "$cmd" in
    config)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=( $(compgen -W "set show clear" -- "$cur") )
        return
      fi
      case "$subcmd" in
        set)
          COMPREPLY=( $(compgen -W "--api-key --base-url --name --skip-verify" -- "$cur") )
          return
          ;;
        show)
          COMPREPLY=( $(compgen -W "--json" -- "$cur") )
          return
          ;;
        clear)
          COMPREPLY=( $(compgen -W "--profile" -- "$cur") )
          return
          ;;
      esac
      ;;
    login)
      COMPREPLY=( $(compgen -W "--api-key --base-url --name --skip-verify" -- "$cur") )
      return
      ;;
    whoami)
      COMPREPLY=( $(compgen -W "--json --profile" -- "$cur") )
      return
      ;;
    verify)
      COMPREPLY=( $(compgen -W "--json --api-key --api-url --profile" -- "$cur") )
      return
      ;;
    use|profiles)
      local profiles
      profiles=$(slideless use --list-names 2>/dev/null)
      COMPREPLY=( $(compgen -W "$profiles --json" -- "$cur") )
      return
      ;;
    logout)
      local profiles
      profiles=$(slideless use --list-names 2>/dev/null)
      COMPREPLY=( $(compgen -W "$profiles" -- "$cur") )
      return
      ;;
    share)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--title --update --api-key --api-url --profile --json" -- "$cur") )
      else
        COMPREPLY=( $(compgen -f -X '!*.html' -- "$cur") )
      fi
      return
      ;;
    update)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--title --api-key --api-url --profile --json" -- "$cur") )
      else
        COMPREPLY=( $(compgen -f -X '!*.html' -- "$cur") )
      fi
      return
      ;;
    list)
      COMPREPLY=( $(compgen -W "--json --api-key --api-url --profile" -- "$cur") )
      return
      ;;
    get)
      COMPREPLY=( $(compgen -W "--json --api-key --api-url --profile" -- "$cur") )
      return
      ;;
    completion)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=( $(compgen -W "bash zsh fish --install --uninstall" -- "$cur") )
        return
      fi
      ;;
  esac

  if [[ -z "$cmd" ]]; then
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
  fi
}

complete -o default -F _slideless_completions slideless`;
}

// ── Zsh completion ───────────────────────────────────────

function generateZshCompletion(): string {
  return `#compdef slideless
# slideless zsh completion

_slideless() {
  local -a commands
  local curcontext="$curcontext" state line

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      commands=(
        'login:Save API key (alias for "config set")'
        'logout:Remove a profile'
        'whoami:Show current authentication identity'
        'use:Switch active profile or list profiles'
        'profiles:List all profiles (alias for use)'
        'verify:Validate the active API key against the backend'
        'config:Manage CLI configuration'
        'share:Upload an HTML file as a public presentation'
        'update:Replace the HTML at an existing share'
        'list:List your presentations'
        'get:Show details for a single presentation'
        'completion:Generate shell completion scripts'
      )
      _describe 'command' commands
      ;;
    args)
      case $line[1] in
        config)
          _arguments -C '1:subcommand:->config_sub' '*::arg:->config_args'
          case $state in
            config_sub)
              local -a config_commands
              config_commands=(
                'set:Save API key and base URL'
                'show:Display current configuration'
                'clear:Remove saved configuration'
              )
              _describe 'subcommand' config_commands
              ;;
            config_args)
              case $line[1] in
                clear)
                  _arguments '--profile[Profile to clear]:profile:'
                  ;;
                set)
                  _arguments \\
                    '--api-key[API key]:key:' \\
                    '--base-url[Base URL override]:url:' \\
                    '--name[Custom profile name]:name:' \\
                    '--skip-verify[Save without verifying]'
                  ;;
                show)
                  _arguments '--json[Output as JSON]'
                  ;;
              esac
              ;;
          esac
          ;;
        login)
          _arguments \\
            '--api-key[API key]:key:' \\
            '--base-url[Base URL override]:url:' \\
            '--name[Custom profile name]:name:' \\
            '--skip-verify[Save without verifying]'
          ;;
        whoami)
          _arguments \\
            '--json[Output as JSON]' \\
            '--profile[Profile name]:profile:'
          ;;
        verify)
          _arguments \\
            '--json[Output as JSON]' \\
            '--api-key[API key]:key:' \\
            '--api-url[Base URL]:url:' \\
            '--profile[Profile name]:profile:'
          ;;
        use|profiles)
          local -a profiles
          profiles=(\${(f)"$(slideless use --list-names 2>/dev/null)"})
          _describe 'profile' profiles
          ;;
        logout)
          local -a profiles
          profiles=(\${(f)"$(slideless use --list-names 2>/dev/null)"})
          _describe 'profile' profiles
          ;;
        share)
          _arguments \\
            '--title[Display title]:title:' \\
            '--update[Update existing share]:presentationId:' \\
            '--api-key[API key]:key:' \\
            '--api-url[Base URL]:url:' \\
            '--profile[Profile name]:profile:' \\
            '--json[Output as JSON]' \\
            '*:html file:_files -g "*.html"'
          ;;
        update)
          _arguments \\
            '--title[New title]:title:' \\
            '--api-key[API key]:key:' \\
            '--api-url[Base URL]:url:' \\
            '--profile[Profile name]:profile:' \\
            '--json[Output as JSON]' \\
            '*:html file:_files -g "*.html"'
          ;;
        list)
          _arguments \\
            '--json[Output as JSON]' \\
            '--api-key[API key]:key:' \\
            '--api-url[Base URL]:url:' \\
            '--profile[Profile name]:profile:'
          ;;
        get)
          _arguments \\
            '--json[Output as JSON]' \\
            '--api-key[API key]:key:' \\
            '--api-url[Base URL]:url:' \\
            '--profile[Profile name]:profile:'
          ;;
        completion)
          _arguments -C \\
            '1:shell:(bash zsh fish)' \\
            '--install[Auto-detect shell and install]' \\
            '--uninstall[Remove installed completion]'
          ;;
      esac
      ;;
  esac
}

compdef _slideless slideless 2>/dev/null`;
}

// ── Fish completion ──────────────────────────────────────

function generateFishCompletion(): string {
  return `# slideless fish completion

complete -c slideless -f

# Top-level commands
complete -c slideless -n '__fish_use_subcommand' -a login -d 'Save API key'
complete -c slideless -n '__fish_use_subcommand' -a logout -d 'Remove a profile'
complete -c slideless -n '__fish_use_subcommand' -a whoami -d 'Show current identity'
complete -c slideless -n '__fish_use_subcommand' -a use -d 'Switch or list profiles'
complete -c slideless -n '__fish_use_subcommand' -a profiles -d 'List all profiles'
complete -c slideless -n '__fish_use_subcommand' -a verify -d 'Validate the active API key'
complete -c slideless -n '__fish_use_subcommand' -a config -d 'Manage CLI configuration'
complete -c slideless -n '__fish_use_subcommand' -a share -d 'Upload an HTML file as a public presentation'
complete -c slideless -n '__fish_use_subcommand' -a update -d 'Replace HTML at an existing share'
complete -c slideless -n '__fish_use_subcommand' -a list -d 'List your presentations'
complete -c slideless -n '__fish_use_subcommand' -a get -d 'Show details for a single presentation'
complete -c slideless -n '__fish_use_subcommand' -a completion -d 'Generate shell completion'

# config subcommands
complete -c slideless -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set show clear' -a set -d 'Save API key'
complete -c slideless -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set show clear' -a show -d 'Display configuration'
complete -c slideless -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set show clear' -a clear -d 'Remove configuration'

# config set / login flags
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l api-key -d 'API key'
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l base-url -d 'Base URL override'
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l name -d 'Custom profile name'
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l skip-verify -d 'Save without verifying'

# config show flags
complete -c slideless -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from show' -l json -d 'Output as JSON'

# config clear flags
complete -c slideless -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from clear' -l profile -d 'Profile to clear'

# whoami / verify / list / get flags
complete -c slideless -n '__fish_seen_subcommand_from whoami verify list get' -l json -d 'Output as JSON'
complete -c slideless -n '__fish_seen_subcommand_from whoami verify list get share update' -l api-key -d 'API key'
complete -c slideless -n '__fish_seen_subcommand_from whoami verify list get share update' -l api-url -d 'Base URL override'
complete -c slideless -n '__fish_seen_subcommand_from whoami verify list get share update' -l profile -d 'Profile name'

# share flags + .html files
complete -c slideless -n '__fish_seen_subcommand_from share' -l title -d 'Display title'
complete -c slideless -n '__fish_seen_subcommand_from share' -l update -d 'Update existing share'
complete -c slideless -n '__fish_seen_subcommand_from share' -l json -d 'Output as JSON'
complete -c slideless -n '__fish_seen_subcommand_from share' -F -a '*.html'

# update flags + .html files
complete -c slideless -n '__fish_seen_subcommand_from update' -l title -d 'New title'
complete -c slideless -n '__fish_seen_subcommand_from update' -l json -d 'Output as JSON'
complete -c slideless -n '__fish_seen_subcommand_from update' -F -a '*.html'

# use / profiles / logout — dynamic profile names
complete -c slideless -n '__fish_seen_subcommand_from use profiles logout' -a '(slideless use --list-names 2>/dev/null)' -d 'Profile'
complete -c slideless -n '__fish_seen_subcommand_from use profiles' -l json -d 'Output as JSON'

# completion subcommands and flags
complete -c slideless -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell type'
complete -c slideless -n '__fish_seen_subcommand_from completion' -l install -d 'Auto-detect and install'
complete -c slideless -n '__fish_seen_subcommand_from completion' -l uninstall -d 'Remove installed completion'`;
}

// ── Install / Uninstall ──────────────────────────────────

function installCompletion(): void {
  const shell = detectShell();
  if (!shell) {
    console.error('Could not detect shell from $SHELL environment variable.');
    console.error('Please run one of:');
    console.error('  slideless completion bash');
    console.error('  slideless completion zsh');
    console.error('  slideless completion fish');
    process.exit(1);
  }

  if (shell === 'fish') {
    const dir = join(homedir(), '.config', 'fish', 'completions');
    mkdirSync(dir, { recursive: true });
    const fishFile = getRcFile(shell);
    writeFileSync(fishFile, generateFishCompletion() + '\n');
    console.log(`Completion installed to ${fishFile}`);
    console.log('Restart your terminal or run: source ' + fishFile);
    return;
  }

  if (shell === 'zsh') {
    const completionsDir = join(homedir(), '.zsh', 'completions');
    const completionFile = join(completionsDir, '_slideless');
    mkdirSync(completionsDir, { recursive: true });
    writeFileSync(completionFile, generateZshCompletion() + '\n');

    const rcFile = getRcFile(shell);
    let rcContent = existsSync(rcFile) ? readFileSync(rcFile, 'utf-8') : '';

    if (rcContent.includes(BEGIN_MARKER)) {
      const beginIdx = rcContent.indexOf(BEGIN_MARKER);
      const endIdx = rcContent.indexOf(END_MARKER);
      if (beginIdx !== -1 && endIdx !== -1) {
        const before = rcContent.slice(0, beginIdx).replace(/\n+$/, '\n');
        const after = rcContent.slice(endIdx + END_MARKER.length).replace(/^\n+/, '\n');
        rcContent = before + after;
      }
    }

    const fpathLine = 'fpath=(~/.zsh/completions $fpath)';
    const compinitLine = 'autoload -Uz compinit && compinit -C';
    const hasFpath = rcContent.includes('~/.zsh/completions');
    const hasCompinit = /autoload.*compinit/.test(rcContent);

    const linesToPrepend: string[] = [];
    if (!hasFpath) linesToPrepend.push(fpathLine);
    if (!hasCompinit) linesToPrepend.push(compinitLine);

    if (linesToPrepend.length > 0) {
      rcContent = linesToPrepend.join('\n') + '\n' + rcContent;
    }

    writeFileSync(rcFile, rcContent);

    if (!hasFpath) console.log(`Added fpath entry to ${rcFile}`);
    if (!hasCompinit) console.log(`Added compinit to ${rcFile}`);
    console.log(`Completion installed to ${completionFile}`);
    console.log('Restart your terminal for changes to take effect.');
    return;
  }

  // bash
  const rcFile = getRcFile(shell);
  const block = [
    '',
    BEGIN_MARKER,
    `eval "$(slideless completion ${shell})"`,
    END_MARKER,
    '',
  ].join('\n');

  if (existsSync(rcFile)) {
    const content = readFileSync(rcFile, 'utf-8');
    if (content.includes(BEGIN_MARKER)) {
      const beginIdx = content.indexOf(BEGIN_MARKER);
      const endIdx = content.indexOf(END_MARKER);
      if (beginIdx !== -1 && endIdx !== -1) {
        const before = content.slice(0, beginIdx).replace(/\n+$/, '\n');
        const after = content.slice(endIdx + END_MARKER.length);
        writeFileSync(rcFile, before + block.trimStart() + after);
        console.log(`Completion updated in ${rcFile}`);
        console.log('Restart your terminal or run: source ' + rcFile);
        return;
      }
    }
  }

  appendFileSync(rcFile, block);
  console.log(`Completion installed in ${rcFile}`);
  console.log('Restart your terminal or run: source ' + rcFile);
}

function uninstallCompletion(): void {
  const shell = detectShell();
  if (!shell) {
    console.error('Could not detect shell from $SHELL environment variable.');
    process.exit(1);
  }

  if (shell === 'fish') {
    const fishFile = getRcFile(shell);
    if (existsSync(fishFile)) {
      unlinkSync(fishFile);
      console.log(`Completion removed from ${fishFile}`);
    } else {
      console.log('No fish completion file found.');
    }
    return;
  }

  if (shell === 'zsh') {
    const completionFile = join(homedir(), '.zsh', 'completions', '_slideless');
    if (existsSync(completionFile)) {
      unlinkSync(completionFile);
      console.log(`Completion removed from ${completionFile}`);
    }

    const rcFile = getRcFile(shell);
    if (existsSync(rcFile)) {
      const content = readFileSync(rcFile, 'utf-8');
      if (content.includes(BEGIN_MARKER)) {
        const beginIdx = content.indexOf(BEGIN_MARKER);
        const endIdx = content.indexOf(END_MARKER);
        if (beginIdx !== -1 && endIdx !== -1) {
          const before = content.slice(0, beginIdx).replace(/\n+$/, '\n');
          const after = content.slice(endIdx + END_MARKER.length).replace(/^\n+/, '\n');
          writeFileSync(rcFile, before + after);
          console.log(`Removed old completion block from ${rcFile}`);
        }
      }
    }
    return;
  }

  // bash
  const rcFile = getRcFile(shell);
  if (!existsSync(rcFile)) {
    console.log(`No ${shell} rc file found at ${rcFile}`);
    return;
  }

  const content = readFileSync(rcFile, 'utf-8');
  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1) {
    console.log(`No slideless completion block found in ${rcFile}`);
    return;
  }

  const before = content.slice(0, beginIdx).replace(/\n+$/, '\n');
  const after = content.slice(endIdx + END_MARKER.length).replace(/^\n+/, '\n');
  writeFileSync(rcFile, before + after);
  console.log(`Completion removed from ${rcFile}`);
}

// ── Command ──────────────────────────────────────────────

export const completionCommand = new Command('completion')
  .description('Generate shell completion scripts')
  .argument('[shell]', 'Shell type: bash, zsh, or fish')
  .option('--install', 'Auto-detect shell and install completion')
  .option('--uninstall', 'Remove installed completion')
  .action((shell?: string, options?: { install?: boolean; uninstall?: boolean }) => {
    if (options?.install) {
      installCompletion();
      return;
    }

    if (options?.uninstall) {
      uninstallCompletion();
      return;
    }

    if (!shell) {
      console.error('Please specify a shell: bash, zsh, or fish');
      console.error('');
      console.error('Usage:');
      console.error('  slideless completion bash       # print bash completion script');
      console.error('  slideless completion zsh        # print zsh completion script');
      console.error('  slideless completion fish       # print fish completion script');
      console.error('  slideless completion --install  # auto-detect and install');
      process.exit(1);
    }

    switch (shell) {
      case 'bash':
        console.log(generateBashCompletion());
        break;
      case 'zsh':
        console.log(generateZshCompletion());
        break;
      case 'fish':
        console.log(generateFishCompletion());
        break;
      default:
        console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
        process.exit(1);
    }
  });
