package webapp

func SupportedPluginRuntimes() []PluginRuntime {
	return []PluginRuntime{
		{Name: "go", Extensions: []string{".go"}, CommandHint: "go run"},
		{Name: "node", Extensions: []string{".js", ".ts", ".mjs"}, CommandHint: "node or tsx"},
		{Name: "python", Extensions: []string{".py"}, CommandHint: "python3"},
	}
}
