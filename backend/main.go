package main

import (
	"database/sql"
	"fmt"
	"log"
	"syscall/js"
	"encoding/json"
	"time"
	_ "github.com/danmestas/go-sqlite3-opfs"
	_ "github.com/ncruces/go-sqlite3/driver"
)

var db *sql.DB

type Project struct {
	ID          int64  `json:"id"`
	Name		string `json:"name"`
	CreatedAt   int64  `json:"created_at"`
}

type Entry struct {
	ID          int64  `json:"id"`
	Name		string `json:"name"`
    ProjectID	*int64 `json:"project_id"`
	StartedAt   int64  `json:"started_at"`
	EndedAt     *int64 `json:"ended_at"`
	CreatedAt   int64  `json:"created_at"`
}

func initConnection(this js.Value, args []js.Value) any {
	var err error
	db, err = sql.Open("sqlite3", "file:track.db?vfs=opfs")
	if err != nil {
		log.Fatal("failed to open db:", err)
	}

	db.SetMaxOpenConns(1)

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS projects (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT NOT NULL,
		created_at INTEGER NOT NULL
		)`)
	if err != nil {
		log.Fatal("failed to create projects table: ", err)
	}

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS entries (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
		name       TEXT,
		started_at INTEGER NOT NULL,
		ended_at   INTEGER,
		created_at INTEGER NOT NULL
		)`)
	if err != nil {
		log.Fatal("failed to create entries table: ", err)
	}
	return nil
}

func addEntry(this js.Value, args []js.Value) any {
	payload := args[0].String()
	
	var entry Entry
	if err := json.Unmarshal([]byte(payload), &entry); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	entry.CreatedAt = time.Now().UnixMilli()
	result, err := db.Exec(`INSERT INTO entries (name, project_id, started_at, ended_at, created_at) VALUES (?, ?, ?, ?, ?)`,
		entry.Name,
		entry.ProjectID,
		entry.StartedAt,
		entry.EndedAt,
		entry.CreatedAt,
	)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	id, err := result.LastInsertId()
	entry.ID = id
	jsonEntry, err := json.Marshal(entry)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return string(jsonEntry)
}

func addProject(this js.Value, args []js.Value) any {
	payload := args[0].String();

	var project Project
	if err := json.Unmarshal([]byte(payload), &project); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	project.CreatedAt = time.Now().UnixMilli()
	result, err := db.Exec(`INSERT INTO projects (name, created_at) VALUES (?, ?)`, project.Name, project.CreatedAt)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return id
}

func getEntries(this js.Value, args []js.Value) any {
	rows, err := db.Query(`SELECT id, name, project_id, started_at, ended_at, created_at FROM entries WHERE ended_at IS NOT null ORDER BY started_at DESC`)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var entry Entry
		if err := rows.Scan(&entry.ID, &entry.Name, &entry.ProjectID, &entry.StartedAt, &entry.EndedAt, &entry.CreatedAt); err != nil {
			return fmt.Sprintf("error: %v", err)
		}
		entries = append(entries, entry)
	}
	result, err := json.Marshal(entries)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return string(result)
}

func getProjects(this js.Value, args []js.Value) any {
	rows, err := db.Query(`SELECT id, name, created_at FROM projects ORDER BY name`)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var project Project
		if err := rows.Scan(&project.ID, &project.Name, &project.CreatedAt); err != nil {
			return fmt.Sprintf("error: %v", err)
		}
		projects = append(projects, project)
	}
	result, err := json.Marshal(projects)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return string(result)
}

func deleteEntry(this js.Value, args []js.Value) any {
	id := args[0].Int()
	_, err := db.Exec(`DELETE FROM entries WHERE id = ?`, id)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "ok"
}

func deleteProject(this js.Value, args []js.Value) any {
	id := args[0].Int()
	_, err := db.Exec(`DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "ok"
}

func updateEntry(this js.Value, args []js.Value) any {
	payload := args[0].String()

	var entry Entry
	if err := json.Unmarshal([]byte(payload), &entry); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	_, err := db.Exec(`UPDATE entries SET name = ?, project_id = ?, started_at = ?, ended_at = ? WHERE id = ?`,
		entry.Name,
		entry.ProjectID,
		entry.StartedAt,
		entry.EndedAt,
		entry.ID,
	)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	jsonEntry, err := json.Marshal(entry)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return string(jsonEntry)
}

func getRunningEntry(this js.Value, args []js.Value) any {
	var entry Entry
	err := db.QueryRow(`SELECT id, name, project_id, started_at, ended_at, created_at FROM entries WHERE ended_at IS NULL LIMIT 1`).Scan(
		&entry.ID,
		&entry.Name,
		&entry.ProjectID,
		&entry.StartedAt,
		&entry.EndedAt,
		&entry.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	jsonEntry, err := json.Marshal(entry)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return string(jsonEntry)
}

func main() {
	js.Global().Set("initConnection", js.FuncOf(initConnection))

	js.Global().Set("addEntry", js.FuncOf(addEntry))
	js.Global().Set("getEntries", js.FuncOf(getEntries))
	js.Global().Set("deleteEntry", js.FuncOf(deleteEntry))
	js.Global().Set("updateEntry", js.FuncOf(updateEntry))
	js.Global().Set("getRunningEntry", js.FuncOf(getRunningEntry))

	js.Global().Set("addProject", js.FuncOf(addProject))
	js.Global().Set("getProjects", js.FuncOf(getProjects))
	js.Global().Set("deleteProject", js.FuncOf(deleteProject))
	select {}
}
