#!/usr/bin/env python3
"""
Full-site recursive crawler for myrient.erista.me
Recursively traverses all directories and collects all links.
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from urllib.parse import urljoin
import sys
import os
from collections import defaultdict

BASE_URL = "https://myrient.erista.me/files/"

def get_page_content(url):
    """Fetch and return the content of a webpage."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        print(f"Error fetching {url}: {e}", file=sys.stderr)
        return None

def get_relative_path(url, base_url):
    """Get the relative path from the base URL."""
    if url.startswith(base_url):
        return url[len(base_url):].rstrip('/')
    return ""

def get_root_folder(path):
    """Extract the top-level folder name from a path."""
    if not path:
        return ""
    parts = path.split('/')
    return parts[0] if parts[0] else ""

def sanitize_filename(name):
    """Sanitize folder name for use as filename."""
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.strip()

def crawl_directory(url, base_url, visited=None):
    """
    Recursively crawl a directory and collect all links.
    Returns a list of items with metadata.
    """
    if visited is None:
        visited = set()
    
    # Avoid revisiting URLs
    if url in visited:
        return []
    
    visited.add(url)
    
    print(f"Crawling: {url}")
    content = get_page_content(url)
    
    if not content:
        return []
    
    soup = BeautifulSoup(content, 'html.parser')
    items = []
    
    # Find all links in the page
    for link in soup.find_all('a'):
        href = link.get('href')
        
        # Skip parent directory and sorting links
        if not href or href.startswith('?') or href == '../':
            continue
        
        # Get the full URL
        full_url = urljoin(url, href)
        
        # Only process URLs under the base URL
        if not full_url.startswith(base_url):
            continue
        
        name = link.get_text(strip=True)
        is_directory = href.endswith('/')
        
        # Calculate path and root
        relative_path = get_relative_path(full_url, base_url)
        root = get_root_folder(relative_path)
        
        # Create item entry
        item = {
            'name': name,
            'url': full_url,
            'kind': 'dir' if is_directory else 'file',
            'path': relative_path,
            'root': root
        }
        
        items.append(item)
        
        # Recursively crawl subdirectories
        if is_directory:
            # Add a small delay to be respectful
            time.sleep(0.5)
            subitems = crawl_directory(full_url, base_url, visited)
            items.extend(subitems)
    
    return items

def main():
    """Main function to perform full-site recursive crawl."""
    print(f"Starting full-site recursive crawl from: {BASE_URL}")
    print("This may take a while...")
    
    start_time = time.time()
    
    # Perform the crawl
    all_items = crawl_directory(BASE_URL, BASE_URL)
    
    # Create output directory
    output_dir = 'data'
    os.makedirs(output_dir, exist_ok=True)
    
    # Save all_links.json (flat list)
    all_links_file = os.path.join(output_dir, 'all_links.json')
    with open(all_links_file, 'w', encoding='utf-8') as f:
        json.dump(all_items, f, indent=2, ensure_ascii=False)
    
    print(f"\nSaved {len(all_items)} items to {all_links_file}")
    
    # Group items by root folder
    items_by_root = defaultdict(list)
    for item in all_items:
        if item['root']:
            items_by_root[item['root']].append(item)
    
    # Save individual root folder JSON files
    for root_name, root_items in items_by_root.items():
        safe_name = sanitize_filename(root_name)
        root_file = os.path.join(output_dir, f'{safe_name}.json')
        
        root_data = {
            'root': root_name,
            'base_url': BASE_URL,
            'item_count': len(root_items),
            'scraped_date': time.strftime('%Y-%m-%d %H:%M:%S'),
            'items': root_items
        }
        
        with open(root_file, 'w', encoding='utf-8') as f:
            json.dump(root_data, f, indent=2, ensure_ascii=False)
        
        print(f"Saved {len(root_items)} items to {root_file}")
    
    elapsed_time = time.time() - start_time
    
    print(f"\n{'='*60}")
    print(f"Crawl complete!")
    print(f"Total items collected: {len(all_items)}")
    print(f"Root folders found: {len(items_by_root)}")
    print(f"Time elapsed: {elapsed_time:.2f} seconds")
    print(f"{'='*60}")
    
    return True

if __name__ == "__main__":
    main()
