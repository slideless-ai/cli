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

  local commands="config login logout whoami use profiles verify push pull share unshare share-email invite uninvite delete list get publish unpublish remix search listing star unstar stars pin completion auth"
  local common_auth="--api-key --api-url --profile --json"

  case "$cmd" in
    config)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=( $(compgen -W "set show clear" -- "$cur") )
        return
      fi
      case "$subcmd" in
        set)
          COMPREPLY=( $(compgen -W "--api-key --api-url --name --skip-verify" -- "$cur") )
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
    auth)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=( $(compgen -W "signup-request signup-complete login-request login-complete" -- "$cur") )
        return
      fi
      case "$subcmd" in
        signup-request|login-request)
          COMPREPLY=( $(compgen -W "--email --api-url --json" -- "$cur") )
          return
          ;;
        signup-complete)
          COMPREPLY=( $(compgen -W "--email --code --first-name --last-name --company --description --brand-primary --brand-secondary --brand-accent --tone --logo --profile-name --key-name --key-expires-in --api-url --json" -- "$cur") )
          return
          ;;
        login-complete)
          COMPREPLY=( $(compgen -W "--email --code --profile-name --key-name --key-expires-in --api-url --json" -- "$cur") )
          return
          ;;
      esac
      ;;
    login)
      COMPREPLY=( $(compgen -W "--api-key --api-url --name --skip-verify" -- "$cur") )
      return
      ;;
    whoami)
      COMPREPLY=( $(compgen -W "--json --profile" -- "$cur") )
      return
      ;;
    verify)
      COMPREPLY=( $(compgen -W "$common_auth" -- "$cur") )
      return
      ;;
    use|profiles)
      local profiles
      profiles=$(slideless use --list-names 2>/dev/null)
      COMPREPLY=( $(compgen -W "$profiles --json" -- "$cur") )
      return
      ;;
    logout)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--json" -- "$cur") )
      else
        local profiles
        profiles=$(slideless use --list-names 2>/dev/null)
        COMPREPLY=( $(compgen -W "$profiles" -- "$cur") )
      fi
      return
      ;;
    push)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--title --entry --message --force --strict $common_auth" -- "$cur") )
      else
        COMPREPLY=( $(compgen -d -- "$cur"; compgen -f -X '!*.html' -- "$cur") )
      fi
      return
      ;;
    pull)
      COMPREPLY=( $(compgen -W "--at --force $common_auth" -- "$cur") )
      return
      ;;
    share)
      COMPREPLY=( $(compgen -W "--name --to-version $common_auth" -- "$cur") )
      return
      ;;
    unshare)
      COMPREPLY=( $(compgen -W "--token $common_auth" -- "$cur") )
      return
      ;;
    share-email)
      COMPREPLY=( $(compgen -W "--message --subject --token-id $common_auth" -- "$cur") )
      return
      ;;
    invite)
      COMPREPLY=( $(compgen -W "--message $common_auth" -- "$cur") )
      return
      ;;
    uninvite)
      COMPREPLY=( $(compgen -W "$common_auth" -- "$cur") )
      return
      ;;
    delete|unpublish)
      COMPREPLY=( $(compgen -W "--yes $common_auth" -- "$cur") )
      return
      ;;
    list|stars)
      COMPREPLY=( $(compgen -W "$common_auth" -- "$cur") )
      return
      ;;
    get)
      COMPREPLY=( $(compgen -W "$common_auth" -- "$cur") )
      return
      ;;
    publish)
      COMPREPLY=( $(compgen -W "--kind --interactive --description --slug --title --readme --tags --category --stack --to-version --thumbnail $common_auth" -- "$cur") )
      return
      ;;
    remix)
      COMPREPLY=( $(compgen -W "--force --api-url --profile --json" -- "$cur") )
      return
      ;;
    search)
      COMPREPLY=( $(compgen -W "--kind --tag --category --stack --sort --limit --api-url --profile --json" -- "$cur") )
      return
      ;;
    listing)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=( $(compgen -W "get update" -- "$cur") )
        return
      fi
      case "$subcmd" in
        get)
          COMPREPLY=( $(compgen -W "--api-url --profile --json" -- "$cur") )
          return
          ;;
        update)
          COMPREPLY=( $(compgen -W "--title --description --readme --tags --category --stack --status --interactive --no-interactive --republish-version $common_auth" -- "$cur") )
          return
          ;;
      esac
      ;;
    star|unstar)
      COMPREPLY=( $(compgen -W "$common_auth" -- "$cur") )
      return
      ;;
    pin)
      COMPREPLY=( $(compgen -W "--to-version --latest $common_auth" -- "$cur") )
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
        'config:Manage CLI configuration'
        'login:Save API key (alias for "config set")'
        'logout:Remove a profile'
        'whoami:Show current authentication identity'
        'use:Switch active profile or list profiles'
        'profiles:List all profiles (alias for use)'
        'verify:Validate the active API key against the backend'
        'push:Upload content (new presentation, or update an existing one)'
        'pull:Download a presentation to a local folder'
        'share:Mint a public viewer token for a presentation'
        'unshare:Revoke a viewer token or archive a presentation'
        'share-email:Email a deck to recipients with tracked tokens'
        'invite:Invite a collaborator (editor access)'
        'uninvite:Revoke a collaborator'
        'delete:Delete a presentation'
        'list:List your presentations'
        'get:Show details for a single presentation'
        'publish:Publish the current deck to the marketplace'
        'unpublish:Remove a marketplace listing'
        'remix:Clone a marketplace listing into a local folder'
        'search:Search the marketplace'
        'listing:Inspect or update a marketplace listing'
        'star:Star a marketplace listing'
        'unstar:Unstar a marketplace listing'
        'stars:List your starred listings'
        'pin:Set a token version mode'
        'completion:Generate shell completion scripts'
        'auth:Email-OTP signup and login'
      )
      _describe 'command' commands
      ;;
    args)
      local -a auth_flags
      auth_flags=(
        '--api-key[API key]:key:'
        '--api-url[Base URL]:url:'
        '--profile[Profile name]:profile:'
        '--json[Output as JSON]'
      )
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
                    '--api-url[Base URL override]:url:' \\
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
        auth)
          _arguments -C '1:subcommand:->auth_sub' '*::arg:->auth_args'
          case $state in
            auth_sub)
              local -a auth_commands
              auth_commands=(
                'signup-request:Email a signup OTP'
                'signup-complete:Complete signup with an OTP'
                'login-request:Email a login OTP'
                'login-complete:Complete login with an OTP'
              )
              _describe 'subcommand' auth_commands
              ;;
            auth_args)
              case $line[1] in
                signup-request|login-request)
                  _arguments \\
                    '--email[Email address]:email:' \\
                    '--api-url[Base URL override]:url:' \\
                    '--json[Output as JSON]'
                  ;;
                signup-complete)
                  _arguments \\
                    '--email[Email address]:email:' \\
                    '--code[OTP code]:code:' \\
                    '--first-name[First name]:name:' \\
                    '--last-name[Last name]:name:' \\
                    '--company[Organization name]:name:' \\
                    '--description[Organization description]:text:' \\
                    '--brand-primary[Brand primary color]:hex:' \\
                    '--brand-secondary[Brand secondary color]:hex:' \\
                    '--brand-accent[Brand accent color]:hex:' \\
                    '--tone[Brand tone]:text:' \\
                    '--logo[Logo file]:file:_files' \\
                    '--profile-name[Local profile name]:name:' \\
                    '--key-name[API key name]:name:' \\
                    '--key-expires-in[Key expiry in days]:days:' \\
                    '--api-url[Base URL override]:url:' \\
                    '--json[Output as JSON]'
                  ;;
                login-complete)
                  _arguments \\
                    '--email[Email address]:email:' \\
                    '--code[OTP code]:code:' \\
                    '--profile-name[Local profile name]:name:' \\
                    '--key-name[API key name]:name:' \\
                    '--key-expires-in[Key expiry in days]:days:' \\
                    '--api-url[Base URL override]:url:' \\
                    '--json[Output as JSON]'
                  ;;
              esac
              ;;
          esac
          ;;
        login)
          _arguments \\
            '--api-key[API key]:key:' \\
            '--api-url[Base URL override]:url:' \\
            '--name[Custom profile name]:name:' \\
            '--skip-verify[Save without verifying]'
          ;;
        whoami)
          _arguments \\
            '--json[Output as JSON]' \\
            '--profile[Profile name]:profile:'
          ;;
        verify|list|stars|get|star|unstar|uninvite)
          _arguments \$auth_flags
          ;;
        use|profiles|logout)
          local -a profiles
          profiles=(\${(f)"$(slideless use --list-names 2>/dev/null)"})
          _describe 'profile' profiles
          ;;
        push)
          _arguments \$auth_flags \\
            '--title[Display title]:title:' \\
            '--entry[Entry HTML file]:file:' \\
            '--message[Commit-like message]:msg:' \\
            '--force[Bypass version-conflict check]' \\
            '--strict[Fail on static-scan warnings]' \\
            '*:deck:_files'
          ;;
        pull)
          _arguments \$auth_flags \\
            '--at[Pin to a specific version]:version:' \\
            '--force[Overwrite a non-empty destination]' \\
            '*:directory:_files -/'
          ;;
        share)
          _arguments \$auth_flags \\
            '--name[Token label]:name:' \\
            '--to-version[Pin token to a version]:version:'
          ;;
        unshare)
          _arguments \$auth_flags \\
            '--token[Revoke only this token]:tokenId:'
          ;;
        share-email)
          _arguments \$auth_flags \\
            '--message[Personal note]:text:' \\
            '--subject[Custom subject line]:text:' \\
            '--token-id[Reuse an existing token]:tokenId:'
          ;;
        invite)
          _arguments \$auth_flags \\
            '--message[Personal invite message]:msg:'
          ;;
        delete|unpublish)
          _arguments \$auth_flags \\
            '--yes[Skip interactive confirmation]'
          ;;
        publish)
          _arguments \$auth_flags \\
            '--kind[Listing kind]:kind:(presentation app plan)' \\
            '--interactive[Mark as interactive]' \\
            '--description[Short description]:text:' \\
            '--slug[Custom URL slug]:slug:' \\
            '--title[Listing title]:title:' \\
            '--readme[Longer markdown description]:text:' \\
            '--tags[Comma-separated tags]:tags:' \\
            '--category[Category]:category:' \\
            '--stack[Tech stack slugs]:stack:' \\
            '--to-version[Pin to a specific version]:version:' \\
            '--thumbnail[Thumbnail asset path]:path:'
          ;;
        remix)
          _arguments \\
            '--api-url[Base URL]:url:' \\
            '--profile[Profile name]:profile:' \\
            '--json[Output as JSON]' \\
            '--force[Overwrite a non-empty destination]' \\
            '*:directory:_files -/'
          ;;
        search)
          _arguments \\
            '--api-url[Base URL]:url:' \\
            '--profile[Profile name]:profile:' \\
            '--json[Output as JSON]' \\
            '--kind[Filter by kind]:kind:(presentation app plan)' \\
            '--tag[Filter by tag]:tag:' \\
            '--category[Filter by category]:category:' \\
            '--stack[Filter by technology]:tech:' \\
            '--sort[Sort order]:sort:(recent popular stars)' \\
            '--limit[Max results]:limit:'
          ;;
        listing)
          _arguments -C '1:subcommand:->listing_sub' '*::arg:->listing_args'
          case $state in
            listing_sub)
              local -a listing_commands
              listing_commands=(
                'get:Show a marketplace listing'
                'update:Update a marketplace listing'
              )
              _describe 'subcommand' listing_commands
              ;;
            listing_args)
              case $line[1] in
                get)
                  _arguments \\
                    '--api-url[Base URL]:url:' \\
                    '--profile[Profile name]:profile:' \\
                    '--json[Output as JSON]'
                  ;;
                update)
                  _arguments \$auth_flags \\
                    '--title[New title]:title:' \\
                    '--description[New description]:text:' \\
                    '--readme[New readme]:text:' \\
                    '--tags[Comma-separated tags]:tags:' \\
                    '--category[New category]:category:' \\
                    '--stack[Tech stack slugs]:stack:' \\
                    '--status[Visibility]:status:(public unlisted)' \\
                    '--interactive[Mark as interactive]' \\
                    '--no-interactive[Mark as non-interactive]' \\
                    '--republish-version[Re-pin to a newer version]:version:'
                  ;;
              esac
              ;;
          esac
          ;;
        pin)
          _arguments \$auth_flags \\
            '--to-version[Pin to a specific version]:version:' \\
            '--latest[Follow the latest version]'
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
complete -c slideless -n '__fish_use_subcommand' -a config -d 'Manage CLI configuration'
complete -c slideless -n '__fish_use_subcommand' -a login -d 'Save API key'
complete -c slideless -n '__fish_use_subcommand' -a logout -d 'Remove a profile'
complete -c slideless -n '__fish_use_subcommand' -a whoami -d 'Show current identity'
complete -c slideless -n '__fish_use_subcommand' -a use -d 'Switch or list profiles'
complete -c slideless -n '__fish_use_subcommand' -a profiles -d 'List all profiles'
complete -c slideless -n '__fish_use_subcommand' -a verify -d 'Validate the active API key'
complete -c slideless -n '__fish_use_subcommand' -a push -d 'Upload content (new or update)'
complete -c slideless -n '__fish_use_subcommand' -a pull -d 'Download a presentation to a local folder'
complete -c slideless -n '__fish_use_subcommand' -a share -d 'Mint a public viewer token'
complete -c slideless -n '__fish_use_subcommand' -a unshare -d 'Revoke a viewer token'
complete -c slideless -n '__fish_use_subcommand' -a share-email -d 'Email a deck to recipients'
complete -c slideless -n '__fish_use_subcommand' -a invite -d 'Invite a collaborator'
complete -c slideless -n '__fish_use_subcommand' -a uninvite -d 'Revoke a collaborator'
complete -c slideless -n '__fish_use_subcommand' -a delete -d 'Delete a presentation'
complete -c slideless -n '__fish_use_subcommand' -a list -d 'List your presentations'
complete -c slideless -n '__fish_use_subcommand' -a get -d 'Show details for a single presentation'
complete -c slideless -n '__fish_use_subcommand' -a publish -d 'Publish the current deck to the marketplace'
complete -c slideless -n '__fish_use_subcommand' -a unpublish -d 'Remove a marketplace listing'
complete -c slideless -n '__fish_use_subcommand' -a remix -d 'Clone a marketplace listing'
complete -c slideless -n '__fish_use_subcommand' -a search -d 'Search the marketplace'
complete -c slideless -n '__fish_use_subcommand' -a listing -d 'Inspect or update a marketplace listing'
complete -c slideless -n '__fish_use_subcommand' -a star -d 'Star a marketplace listing'
complete -c slideless -n '__fish_use_subcommand' -a unstar -d 'Unstar a marketplace listing'
complete -c slideless -n '__fish_use_subcommand' -a stars -d 'List your starred listings'
complete -c slideless -n '__fish_use_subcommand' -a pin -d 'Set a token version mode'
complete -c slideless -n '__fish_use_subcommand' -a completion -d 'Generate shell completion'
complete -c slideless -n '__fish_use_subcommand' -a auth -d 'Email-OTP signup and login'

# config subcommands
complete -c slideless -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set show clear' -a set -d 'Save API key'
complete -c slideless -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set show clear' -a show -d 'Display configuration'
complete -c slideless -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set show clear' -a clear -d 'Remove configuration'

# auth subcommands
complete -c slideless -n '__fish_seen_subcommand_from auth; and not __fish_seen_subcommand_from signup-request signup-complete login-request login-complete' -a signup-request -d 'Email a signup OTP'
complete -c slideless -n '__fish_seen_subcommand_from auth; and not __fish_seen_subcommand_from signup-request signup-complete login-request login-complete' -a signup-complete -d 'Complete signup with an OTP'
complete -c slideless -n '__fish_seen_subcommand_from auth; and not __fish_seen_subcommand_from signup-request signup-complete login-request login-complete' -a login-request -d 'Email a login OTP'
complete -c slideless -n '__fish_seen_subcommand_from auth; and not __fish_seen_subcommand_from signup-request signup-complete login-request login-complete' -a login-complete -d 'Complete login with an OTP'

# config set / login flags
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l api-key -d 'API key'
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l api-url -d 'Base URL override'
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l name -d 'Custom profile name'
complete -c slideless -n '__fish_seen_subcommand_from login; or (__fish_seen_subcommand_from config; and __fish_seen_subcommand_from set)' -l skip-verify -d 'Save without verifying'

# config show flags
complete -c slideless -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from show' -l json -d 'Output as JSON'

# config clear flags
complete -c slideless -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from clear' -l profile -d 'Profile to clear'

# auth flags
complete -c slideless -n '__fish_seen_subcommand_from auth' -l email -d 'Email address'
complete -c slideless -n '__fish_seen_subcommand_from auth' -l api-url -d 'Base URL override'
complete -c slideless -n '__fish_seen_subcommand_from auth' -l json -d 'Output as JSON'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete login-complete' -l code -d 'OTP code'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete login-complete' -l profile-name -d 'Local profile name'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete login-complete' -l key-name -d 'API key name'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete login-complete' -l key-expires-in -d 'Key expiry in days'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l first-name -d 'First name'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l last-name -d 'Last name'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l company -d 'Organization name'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l description -d 'Organization description'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l brand-primary -d 'Brand primary color'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l brand-secondary -d 'Brand secondary color'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l brand-accent -d 'Brand accent color'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l tone -d 'Brand tone'
complete -c slideless -n '__fish_seen_subcommand_from auth; and __fish_seen_subcommand_from signup-complete' -l logo -d 'Logo file'

# shared --json flag
complete -c slideless -n '__fish_seen_subcommand_from whoami verify list get push pull share unshare share-email invite uninvite delete publish unpublish remix search star unstar stars pin' -l json -d 'Output as JSON'

# shared auth flags (commands that talk to the backend)
complete -c slideless -n '__fish_seen_subcommand_from verify list get push pull share unshare share-email invite uninvite delete publish unpublish star unstar stars pin' -l api-key -d 'API key'
complete -c slideless -n '__fish_seen_subcommand_from verify list get push pull share unshare share-email invite uninvite delete publish unpublish remix search star unstar stars pin' -l api-url -d 'Base URL override'
complete -c slideless -n '__fish_seen_subcommand_from verify list get push pull share unshare share-email invite uninvite delete publish unpublish remix search star unstar stars pin' -l profile -d 'Profile name'

# push flags
complete -c slideless -n '__fish_seen_subcommand_from push' -l title -d 'Display title'
complete -c slideless -n '__fish_seen_subcommand_from push' -l entry -d 'Entry HTML file'
complete -c slideless -n '__fish_seen_subcommand_from push' -l message -d 'Commit-like message'
complete -c slideless -n '__fish_seen_subcommand_from push' -l force -d 'Bypass version-conflict check'
complete -c slideless -n '__fish_seen_subcommand_from push' -l strict -d 'Fail on static-scan warnings'

# pull flags
complete -c slideless -n '__fish_seen_subcommand_from pull' -l at -d 'Pin to a specific version'
complete -c slideless -n '__fish_seen_subcommand_from pull' -l force -d 'Overwrite a non-empty destination'

# share flags
complete -c slideless -n '__fish_seen_subcommand_from share; and not __fish_seen_subcommand_from share-email' -l name -d 'Token label'
complete -c slideless -n '__fish_seen_subcommand_from share; and not __fish_seen_subcommand_from share-email' -l to-version -d 'Pin token to a version'

# unshare flags
complete -c slideless -n '__fish_seen_subcommand_from unshare' -l token -d 'Revoke only this token'

# share-email flags
complete -c slideless -n '__fish_seen_subcommand_from share-email' -l message -d 'Personal note'
complete -c slideless -n '__fish_seen_subcommand_from share-email' -l subject -d 'Custom subject line'
complete -c slideless -n '__fish_seen_subcommand_from share-email' -l token-id -d 'Reuse an existing token'

# invite flags
complete -c slideless -n '__fish_seen_subcommand_from invite' -l message -d 'Personal invite message'

# delete / unpublish flags
complete -c slideless -n '__fish_seen_subcommand_from delete unpublish' -l yes -d 'Skip interactive confirmation'

# publish flags
complete -c slideless -n '__fish_seen_subcommand_from publish' -l kind -d 'Listing kind' -a 'presentation app plan'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l interactive -d 'Mark as interactive'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l description -d 'Short description'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l slug -d 'Custom URL slug'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l title -d 'Listing title'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l readme -d 'Longer markdown description'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l tags -d 'Comma-separated tags'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l category -d 'Category'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l stack -d 'Tech stack slugs'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l to-version -d 'Pin to a specific version'
complete -c slideless -n '__fish_seen_subcommand_from publish' -l thumbnail -d 'Thumbnail asset path'

# remix flags
complete -c slideless -n '__fish_seen_subcommand_from remix' -l force -d 'Overwrite a non-empty destination'

# search flags
complete -c slideless -n '__fish_seen_subcommand_from search' -l kind -d 'Filter by kind' -a 'presentation app plan'
complete -c slideless -n '__fish_seen_subcommand_from search' -l tag -d 'Filter by tag'
complete -c slideless -n '__fish_seen_subcommand_from search' -l category -d 'Filter by category'
complete -c slideless -n '__fish_seen_subcommand_from search' -l stack -d 'Filter by technology'
complete -c slideless -n '__fish_seen_subcommand_from search' -l sort -d 'Sort order' -a 'recent popular stars'
complete -c slideless -n '__fish_seen_subcommand_from search' -l limit -d 'Max results'

# listing subcommands
complete -c slideless -n '__fish_seen_subcommand_from listing; and not __fish_seen_subcommand_from get update' -a get -d 'Show a marketplace listing'
complete -c slideless -n '__fish_seen_subcommand_from listing; and not __fish_seen_subcommand_from get update' -a update -d 'Update a marketplace listing'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l title -d 'New title'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l description -d 'New description'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l readme -d 'New readme'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l tags -d 'Comma-separated tags'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l category -d 'New category'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l stack -d 'Tech stack slugs'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l status -d 'Visibility' -a 'public unlisted'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l interactive -d 'Mark as interactive'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l no-interactive -d 'Mark as non-interactive'
complete -c slideless -n '__fish_seen_subcommand_from listing; and __fish_seen_subcommand_from update' -l republish-version -d 'Re-pin to a newer version'
complete -c slideless -n '__fish_seen_subcommand_from listing' -l api-url -d 'Base URL override'
complete -c slideless -n '__fish_seen_subcommand_from listing' -l profile -d 'Profile name'
complete -c slideless -n '__fish_seen_subcommand_from listing' -l json -d 'Output as JSON'

# pin flags
complete -c slideless -n '__fish_seen_subcommand_from pin' -l to-version -d 'Pin to a specific version'
complete -c slideless -n '__fish_seen_subcommand_from pin' -l latest -d 'Follow the latest version'

# use / profiles / logout — dynamic profile names
complete -c slideless -n '__fish_seen_subcommand_from use profiles logout' -a '(slideless use --list-names 2>/dev/null)' -d 'Profile'
complete -c slideless -n '__fish_seen_subcommand_from use profiles' -l json -d 'Output as JSON'
complete -c slideless -n '__fish_seen_subcommand_from logout' -l json -d 'Output as JSON'

# whoami flags
complete -c slideless -n '__fish_seen_subcommand_from whoami' -l profile -d 'Profile name'

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
