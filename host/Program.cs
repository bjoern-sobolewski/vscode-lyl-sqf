using System.Text;
using System.Text.Json;
using Arma3.DevTools.Core;

Console.InputEncoding = Encoding.UTF8;
Console.OutputEncoding = new UTF8Encoding(false);
var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
if (args.Length < 2) { Console.Error.WriteLine("Usage: LYL.Sqf.EditorHost ROOT serve SNAPSHOT | test [existing test arguments]"); return 2; }
var root = Path.GetFullPath(args[0]);
if (args[1] == "test") return await SqfTestCommand.RunAsync(root, args.Skip(2).ToArray(), Console.WriteLine);
if (args[1] != "serve" || args.Length != 3) return 2;
var stage = Path.GetFullPath(args[2]);
if (stage.Equals(root, StringComparison.OrdinalIgnoreCase) || root.StartsWith(stage + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
    throw new ArgumentException("Snapshot must not contain the repository");
SqfWorkspaceSnapshot? snapshot = null;
SqfEditorAnalysisSession? analysis = null;
Dictionary<string, string[]>? aliases = null;
while (await Console.In.ReadLineAsync() is { } line)
{
    long id = 0;
    try
    {
        using var document = JsonDocument.Parse(line);
        var request = document.RootElement;
        id = request.GetProperty("id").GetInt64();
        var p = request.GetProperty("params");
        string PathArg() => p.GetProperty("path").GetString()!;
        string[] Paths() => p.GetProperty("files").EnumerateArray().Select(f => f.GetString()!).ToArray();
        object? result;
        switch (request.GetProperty("method").GetString())
        {
            case "prepare":
                result = snapshot = SqfAnalysisWorkspace.Prepare(root, stage, arma: p.TryGetProperty("arma", out var arma) ? arma.GetString() : null);
                aliases = snapshot.Files.GroupBy(f => f.Source, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.Select(f => f.Target).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(), StringComparer.OrdinalIgnoreCase);
                analysis = new SqfEditorAnalysisSession(root);
                break;
            case "update":
                if (snapshot is null) throw new InvalidOperationException("Prepare the workspace first");
                var source = DependencyProvisioning.Within(root, PathArg());
                if (aliases is null || !aliases.TryGetValue(source, out var targets)) throw new InvalidOperationException("Source not mapped; rebuild the analysis workspace: " + PathArg());
                foreach (var target in targets) File.WriteAllText(target, p.GetProperty("text").GetString(), new UTF8Encoding(false));
                result = targets; break;
            case "analyze": result = (analysis ??= new SqfEditorAnalysisSession(root)).Analyze(PathArg(), p.GetProperty("text").GetString()!); break;
            case "hover": result = (analysis ??= new SqfEditorAnalysisSession(root)).Documentation(p.GetProperty("command").GetString()!); break;
            case "commands":
                if (snapshot is null) throw new InvalidOperationException("Prepare the workspace first");
                using (var reference = JsonDocument.Parse(File.ReadAllText(Path.Combine(stage, ".hemtt/command-reference.json"))))
                    result = reference.RootElement.GetProperty("commands").EnumerateObject().Select(c => c.Name).ToArray();
                break;
            case "tests": result = SqfEditorAnalysis.RelevantTests(root, Paths()); break;
            default: throw new ArgumentException("Unknown editor method");
        }
        Console.WriteLine(JsonSerializer.Serialize(new { id, result }, options));
    }
    catch (Exception e) { Console.WriteLine(JsonSerializer.Serialize(new { id, error = e.Message }, options)); }
}
return 0;
