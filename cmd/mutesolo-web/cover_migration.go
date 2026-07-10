package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"Mutesolo/internal/storage"
	"Mutesolo/internal/webapp"
)

// runCoverMigration downloads and uploads cover images for projects that don't have one yet.
func runCoverMigration(repo webapp.Repository, minioClient *storage.Client, state webapp.State) {
	projects := state.Projects
	if len(projects) == 0 {
		return
	}
	log.Printf("cover migration: checking %d projects", len(projects))
	migrated := 0
	for i := range projects {
		p := &projects[i]
		if p.CoverURL != "" {
			continue // Already has a cover URL.
		}
		// Download from picsum and upload to MinIO.
		imageURL := fmt.Sprintf("https://picsum.photos/seed/%s/400/300", p.ID)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		data, contentType, err := storage.DownloadImage(ctx, imageURL)
		cancel()
		if err != nil {
			log.Printf("cover migration: download %s: %v", p.ID, err)
			continue
		}
		ctx2, cancel2 := context.WithTimeout(context.Background(), 30*time.Second)
		url, err := minioClient.UploadImage(ctx2, p.ID, data, contentType)
		cancel2()
		if err != nil {
			log.Printf("cover migration: upload %s: %v", p.ID, err)
			continue
		}
		// Set the cover URL and save state.
		p.CoverURL = url
		state.Projects = projects
		if err := repo.Save(state); err != nil {
			log.Printf("cover migration: save %s: %v", p.ID, err)
			continue
		}
		migrated++
	}
	if migrated > 0 {
		log.Printf("cover migration: %d covers migrated", migrated)
	}
}
