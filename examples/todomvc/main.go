package main

import (
	"html/template"
	"log"
	"net/http"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

var repoRoot = func() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..")
}()

type Todo struct {
	ID   int
	Text string
	Done bool
}

type Store struct {
	mu    sync.Mutex
	todos []Todo
	next  int
}

var db = Store{
	todos: []Todo{
		{ID: 1, Text: "Taste x.js", Done: true},
		{ID: 2, Text: "Buy a unicorn", Done: false},
	},
	next: 3,
}

func filterFrom(r *http.Request) string {
	switch f := r.URL.Query().Get("filter"); f {
	case "active", "completed":
		return f
	default:
		return "all"
	}
}

func visible(todos []Todo, filter string) []Todo {
	if filter == "all" {
		return todos
	}
	out := make([]Todo, 0, len(todos))
	for _, t := range todos {
		if (filter == "active") == !t.Done {
			out = append(out, t)
		}
	}
	return out
}

var filterLabels = map[string]string{"all": "All", "active": "Active", "completed": "Completed"}

type rowView struct {
	ID      int
	Text    string
	Done    bool
	Editing bool
	Filter  string
}

type filterLink struct {
	Name     string
	Label    string
	Selected bool
}

type bodyView struct {
	Filter       string
	HasAny       bool
	Rows         []rowView
	AllDone      bool
	Left         int
	Item         string
	FilterLinks  []filterLink
	HasCompleted bool
}

func buildBody(all []Todo, filter string, editing int) bodyView {
	v := bodyView{Filter: filter, HasAny: len(all) > 0, AllDone: true, Item: "items"}
	for _, t := range all {
		if t.Done {
			v.HasCompleted = true
		} else {
			v.AllDone = false
			v.Left++
		}
	}
	if v.Left == 1 {
		v.Item = "item"
	}
	for _, t := range visible(all, filter) {
		v.Rows = append(v.Rows, rowView{ID: t.ID, Text: t.Text, Done: t.Done, Editing: t.ID == editing, Filter: filter})
	}
	for _, f := range []string{"all", "active", "completed"} {
		v.FilterLinks = append(v.FilterLinks, filterLink{Name: f, Label: filterLabels[f], Selected: f == filter})
	}
	return v
}

func snapshot() []Todo {
	db.mu.Lock()
	defer db.mu.Unlock()
	return append([]Todo{}, db.todos...)
}

func writeBody(w http.ResponseWriter, filter string, editing int) {
	tmpl.ExecuteTemplate(w, "body", buildBody(snapshot(), filter, editing))
}

func writeToast(w http.ResponseWriter, msg string) {
	tmpl.ExecuteTemplate(w, "toast", msg)
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl.ExecuteTemplate(w, "page", buildBody(snapshot(), filterFrom(r), 0))
}

func handleList(w http.ResponseWriter, r *http.Request) {
	writeBody(w, filterFrom(r), 0)
}

func handleAdd(w http.ResponseWriter, r *http.Request) {
	text := strings.TrimSpace(r.FormValue("text"))
	if text != "" {
		db.mu.Lock()
		db.todos = append(db.todos, Todo{ID: db.next, Text: text})
		db.next++
		db.mu.Unlock()
	}
	writeBody(w, filterFrom(r), 0)
	if text != "" {
		writeToast(w, `Added "`+text+`"`)
	}
}

func handleToggle(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	db.mu.Lock()
	for i := range db.todos {
		if db.todos[i].ID == id {
			db.todos[i].Done = !db.todos[i].Done
		}
	}
	db.mu.Unlock()
	writeBody(w, filterFrom(r), 0)
}

func handleToggleAll(w http.ResponseWriter, r *http.Request) {
	db.mu.Lock()
	allDone := true
	for _, t := range db.todos {
		if !t.Done {
			allDone = false
			break
		}
	}
	for i := range db.todos {
		db.todos[i].Done = !allDone
	}
	db.mu.Unlock()
	writeBody(w, filterFrom(r), 0)
}

func handleEdit(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	writeBody(w, filterFrom(r), id)
}

func handleSave(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	text := strings.TrimSpace(r.FormValue("text"))
	deleted := ""
	db.mu.Lock()
	if text == "" {
		for i, t := range db.todos {
			if t.ID == id {
				deleted = t.Text
				db.todos = append(db.todos[:i], db.todos[i+1:]...)
				break
			}
		}
	} else {
		for i := range db.todos {
			if db.todos[i].ID == id {
				db.todos[i].Text = text
			}
		}
	}
	db.mu.Unlock()
	writeBody(w, filterFrom(r), 0)
	if deleted != "" {
		writeToast(w, `Deleted "`+deleted+`"`)
	}
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	deleted := ""
	db.mu.Lock()
	for i, t := range db.todos {
		if t.ID == id {
			deleted = t.Text
			db.todos = append(db.todos[:i], db.todos[i+1:]...)
			break
		}
	}
	db.mu.Unlock()
	writeBody(w, filterFrom(r), 0)
	if deleted != "" {
		writeToast(w, `Deleted "`+deleted+`"`)
	}
}

func handleClearCompleted(w http.ResponseWriter, r *http.Request) {
	db.mu.Lock()
	kept := db.todos[:0:0]
	cleared := 0
	for _, t := range db.todos {
		if t.Done {
			cleared++
		} else {
			kept = append(kept, t)
		}
	}
	db.todos = kept
	db.mu.Unlock()
	writeBody(w, filterFrom(r), 0)
	if cleared > 0 {
		writeToast(w, "Cleared "+strconv.Itoa(cleared)+" completed")
	}
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /x.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(repoRoot, "x.js"))
	})
	mux.HandleFunc("GET /plugins/history.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(repoRoot, "plugins/history.js"))
	})
	mux.HandleFunc("GET /plugins/oob.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(repoRoot, "plugins/oob.js"))
	})

	mux.HandleFunc("GET /", handleIndex)
	mux.HandleFunc("GET /todos", handleList)
	mux.HandleFunc("POST /todos", handleAdd)
	mux.HandleFunc("PUT /todos/toggle-all", handleToggleAll)
	mux.HandleFunc("DELETE /todos/completed", handleClearCompleted)
	mux.HandleFunc("GET /todos/{id}/edit", handleEdit)
	mux.HandleFunc("PUT /todos/{id}/toggle", handleToggle)
	mux.HandleFunc("PUT /todos/{id}", handleSave)
	mux.HandleFunc("DELETE /todos/{id}", handleDelete)

	log.Println("TodoMVC (x.js) running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

var tmpl = template.Must(template.New("todomvc").Parse(`
{{- define "row" -}}
{{- if .Editing}}<li class="editing" id="todo-{{.ID}}">
  <form x-put="/todos/{{.ID}}?filter={{.Filter}}" x-trigger="submit, focusout">
    <input class="edit" name="text" value="{{.Text}}" autofocus>
  </form>
</li>
{{- else}}<li{{if .Done}} class="completed"{{end}} id="todo-{{.ID}}">
  <div class="view">
    <input class="toggle" type="checkbox"{{if .Done}} checked{{end}} x-put="/todos/{{.ID}}/toggle?filter={{.Filter}}">
    <label x-trigger="dblclick" x-get="/todos/{{.ID}}/edit?filter={{.Filter}}">{{.Text}}</label>
    <button class="destroy" x-delete="/todos/{{.ID}}?filter={{.Filter}}">&times;</button>
  </div>
</li>
{{- end}}
{{- end}}

{{- define "body" -}}
<form x-post="/todos?filter={{.Filter}}">
  <input class="new-todo" name="text" placeholder="What needs to be done?" autofocus>
</form>
{{- if .HasAny}}
<section class="main">
  <input id="toggle-all" class="toggle-all" type="checkbox"{{if .AllDone}} checked{{end}} x-put="/todos/toggle-all?filter={{.Filter}}">
  <label for="toggle-all">Mark all as complete</label>
  <ul class="todo-list">{{range .Rows}}{{template "row" .}}{{end}}</ul>
</section>
<footer class="footer">
  <span class="todo-count"><strong>{{.Left}}</strong> {{.Item}} left</span>
  <ul class="filters">{{range .FilterLinks}}<li><a href="/?filter={{.Name}}" x-get="/todos?filter={{.Name}}" x-push-url="/?filter={{.Name}}"{{if .Selected}} class="selected"{{end}}>{{.Label}}</a></li>{{end}}</ul>
  {{- if .HasCompleted}}
  <button class="clear-completed" x-delete="/todos/completed?filter={{.Filter}}">Clear completed</button>
  {{- end}}
</footer>
{{- end}}
{{- end}}

{{- define "toast"}}<div id="toast" x-swap-oob>{{.}}</div>
{{- end}}

{{define "page"}}<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>TodoMVC • x.js</title>
<style>
body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; color: #4d4d4d; }
.todoapp { position: relative; max-width: 550px; margin: 8.5rem auto 2.5rem; background: #fff;
  box-shadow: 0 2px 4px 0 rgba(0,0,0,.2), 0 25px 50px 0 rgba(0,0,0,.1); }
h1 { position: absolute; top: -9.5rem; width: 100%; text-align: center; margin: 0;
  font-size: 6rem; font-weight: 100; color: rgba(175,47,47,.15); }
.new-todo, .edit { position: relative; margin: 0; width: 100%; font-size: 1.5rem;
  padding: .8rem .8rem .8rem 3.5rem; border: none; box-shadow: inset 0 -2px 1px rgba(0,0,0,.03); box-sizing: border-box; }
.new-todo::placeholder, .edit::placeholder { font-style: italic; color: #e6e6e6; }
.new-todo:focus, .edit:focus { outline: none; }
.main { border-top: 1px solid #e6e6e6; }
.toggle-all { position: absolute; opacity: 0; width: 1px; height: 1px; }
.toggle-all + label { display: flex; align-items: center; justify-content: center;
  width: 2.5rem; height: 2.5rem; margin: 0; font-size: 0; cursor: pointer; }
.toggle-all + label:before { content: '❯'; font-size: 1.375rem; color: #e6e6e6; transform: rotate(90deg); }
.toggle-all:checked + label:before { color: #737373; }
.todo-list { margin: 0; padding: 0; list-style: none; }
.todo-list li { position: relative; font-size: 1.5rem; border-bottom: 1px solid #ededed; }
.todo-list li .view { display: flex; align-items: center; padding: .5rem 1rem .5rem 0; }
.todo-list li.editing .view { display: none; }
.todo-list li label { flex: 1; padding: .3rem; word-break: break-all; }
.todo-list li.completed label { color: #949494; text-decoration: line-through; }
.toggle {
  appearance: none; -webkit-appearance: none; margin: 0 .5rem 0 0; flex-shrink: 0; cursor: pointer;
  width: 2.5rem; height: 2.5rem; background: no-repeat center / 1.75rem
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-10 -18 100 135'%3E%3Ccircle cx='50' cy='50' r='50' fill='none' stroke='%23ededed' stroke-width='3'/%3E%3C/svg%3E");
}
.toggle:checked {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-10 -18 100 135'%3E%3Ccircle cx='50' cy='50' r='50' fill='none' stroke='%23bddad5' stroke-width='3'/%3E%3Cpath fill='%235dc2af' d='M72 25L42 71 27 56l-4 4 20 20 34-52z'/%3E%3C/svg%3E");
}
.destroy { visibility: hidden; border: none; background: none; color: #cc9a9a; font-size: 2rem;
  cursor: pointer; margin-left: auto; padding: 0 .5rem; }
.todo-list li:hover .destroy { visibility: visible; }
.destroy:hover { color: #af5b5e; }
.main, .footer { padding: 0 1rem; }
.footer { display: flex; align-items: center; padding: 1rem; font-size: .9rem; color: #777;
  border-top: 1px solid #ededed; }
.todo-count { flex: 1; }
.todo-count strong { font-weight: 400; }
.filters { display: flex; gap: .2rem; list-style: none; margin: 0; padding: 0; }
.filters a { color: inherit; text-decoration: none; padding: .2rem .5rem; border: 1px solid transparent; border-radius: 3px; }
.filters a:hover { border-color: rgba(175,47,47,.1); }
.filters a.selected { border-color: rgba(175,47,47,.2); }
.clear-completed { border: none; background: none; color: inherit; cursor: pointer; text-decoration: underline; }
#toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #1a1a2e; color: #fff;
  padding: .6rem 1.2rem; border-radius: 8px; font-size: .9rem; }
#toast:empty { display: none; }
#toast:not(:empty) { animation: toast-fade 2.5s ease forwards; }
@keyframes toast-fade { 0%, 70% { opacity: 1; visibility: visible; } 100% { opacity: 0; visibility: hidden; } }
</style>
</head>
<body>
<section class="todoapp">
  <header class="header">
    <h1>todos</h1>
    <div id="todo-body" x-target="#todo-body">{{template "body" .}}</div>
  </header>
</section>
<div id="toast"></div>
<script src="/x.js"></script>
<script src="/plugins/history.js"></script>
<script src="/plugins/oob.js"></script>
<script>
  window.addEventListener('popstate', () => {
    window._xPopstate = true;
    const filter = new URLSearchParams(location.search).get('filter') || 'all';
    window.x.send(document.getElementById('todo-body'), 'get', '/todos?filter=' + filter);
  });
</script>
</body>
</html>
{{end}}
`))
