# Command reference provenance

`reference.json` is a normalized snapshot of the Arma 3 entries from
[acemod/arma3-wiki](https://github.com/acemod/arma3-wiki/tree/b414af719bc675ffd97c17568fb3b2f5a5237753/commands),
the structured Community Wiki data also used by HEMTT. Each command retains its
original description, parameters, return data, notes, version and locality fields,
with a link to its source page. Wiki markup is preserved, not executed.

The underlying documentation is by the Bohemia Interactive Community Wiki
contributors. See the source pages and
[Community Wiki copyright terms](https://community.bistudio.com/wiki/Bohemia_Interactive_Community:Copyrights)
for attribution and licensing. The snapshot is a format conversion of that data;
it is documentation, not a dump of the installed engine's command registry.

The exact upstream revision and downloaded archive SHA-256 are recorded in the
JSON and in `tools/arma-commands/update-reference.py`. Updates are explicit and
reviewable; normal lookup and project checks never update the snapshot.
Maintainers need Python and PyYAML to regenerate it; users of the published
launcher need neither.

`contracts.json` adds reviewed project guidance. It deliberately keeps these
interpretations separate from the upstream metadata. In particular, the upstream
`server_exec` flag alone is not a reliable classification of all server-only
commands: `owner` documents its restriction in prose.
