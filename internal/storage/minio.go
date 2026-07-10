package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Client wraps a MinIO connection for project cover image operations.
type Client struct {
	mc     *minio.Client
	bucket string
}

// NewClient creates a MinIO client connected to the given endpoint.
func NewClient(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}
	return &Client{mc: mc, bucket: bucket}, nil
}

// EnsureBucket creates the bucket if it doesn't exist.
func (c *Client) EnsureBucket(ctx context.Context) error {
	exists, err := c.mc.BucketExists(ctx, c.bucket)
	if err != nil {
		return fmt.Errorf("check bucket existence: %w", err)
	}
	if !exists {
		if err := c.mc.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("create bucket %s: %w", c.bucket, err)
		}
	}
	return nil
}

// UploadImage uploads image data for a project and returns the public URL.
// The object name is the projectID (1:1 binding).
func (c *Client) UploadImage(ctx context.Context, projectID string, imageData []byte, contentType string) (string, error) {
	if contentType == "" {
		contentType = "image/jpeg"
	}
	reader := bytes.NewReader(imageData)
	_, err := c.mc.PutObject(ctx, c.bucket, projectID, reader, int64(len(imageData)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("upload image for project %s: %w", projectID, err)
	}
	return c.ImageURL(projectID), nil
}

// DeleteImage removes the cover image object from MinIO.
func (c *Client) DeleteImage(ctx context.Context, projectID string) error {
	err := c.mc.RemoveObject(ctx, c.bucket, projectID, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("delete image for project %s: %w", projectID, err)
	}
	return nil
}

// ImageURL returns the public URL for a project's cover image.
func (c *Client) ImageURL(projectID string) string {
	return fmt.Sprintf("http://127.0.0.1:9000/%s/%s", c.bucket, projectID)
}

// PresignedGetURL returns a temporary presigned URL valid for the given duration.
func (c *Client) PresignedGetURL(ctx context.Context, projectID string, expiry time.Duration) (string, error) {
	u, err := c.mc.PresignedGetObject(ctx, c.bucket, projectID, expiry, url.Values{})
	if err != nil {
		return "", fmt.Errorf("presigned url for project %s: %w", projectID, err)
	}
	return u.String(), nil
}

// DownloadImage downloads image data from a URL (used for picsum → minio migration).
func DownloadImage(ctx context.Context, imageURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("create request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("download image: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024)) // 10 MB limit
	if err != nil {
		return nil, "", fmt.Errorf("read image body: %w", err)
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	return data, contentType, nil
}
