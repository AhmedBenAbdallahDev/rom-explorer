#!/usr/bin/env python3
"""
Script to scrape No-Intro ROM URLs from myrient.erista.me
Saves each platform as a separate JSON file.
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from urllib.parse import urljoin
import sys
import os

BASE_URL = "https://myrient.erista.me/files/No-Intro/"

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

def scrape_platform_games(platform_url, platform_name):
    """Scrape all game ROM URLs from a platform page."""
    print(f"Scraping platform: {platform_name}")
    content = get_page_content(platform_url)
    
    if not content:
        return []
    
    soup = BeautifulSoup(content, 'html.parser')
    games = []
    
    # Find all links in the page
    for link in soup.find_all('a'):
        href = link.get('href')
        if href and not href.startswith('?') and href != '../':
            # Get the full URL
            full_url = urljoin(platform_url, href)
            file_name = link.get_text(strip=True)
            
            # Filter for ROM files (common extensions)
            if any(file_name.lower().endswith(ext) for ext in ['.zip', '.7z', '.rar']):
                games.append({
                    'name': file_name,
                    'url': full_url
                })
    
    print(f"  Found {len(games)} games")
    return games

def sanitize_filename(name):
    """Sanitize platform name for use as filename."""
    # Remove or replace invalid characters
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.strip()

def scrape_no_intro():
    """Main function to scrape all platforms and their games."""
    print("Starting No-Intro ROM scraper...")
    print(f"Fetching main page: {BASE_URL}")
    
    content = get_page_content(BASE_URL)
    if not content:
        print("Failed to fetch main page. Exiting.")
        return None
    
    soup = BeautifulSoup(content, 'html.parser')
    
    # Create output directory
    output_dir = 'data'
    os.makedirs(output_dir, exist_ok=True)
    
    platform_count = 0
    total_games = 0
    
    # Find all platform directories
    for link in soup.find_all('a'):
        href = link.get('href')
        
        # Skip parent directory and sorting links
        if href and href.endswith('/') and href not in ['../', '?C=N;O=D', '?C=M;O=A', '?C=S;O=A', '?C=D;O=A']:
            platform_name = href.rstrip('/')
            platform_url = urljoin(BASE_URL, href)
            
            # Scrape games for this platform
            games = scrape_platform_games(platform_url, platform_name)
            
            if games:
                # Create platform data
                platform_data = {
                    'platform': platform_name,
                    'url': platform_url,
                    'game_count': len(games),
                    'scraped_date': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'games': games
                }
                
                # Save to individual JSON file
                safe_name = sanitize_filename(platform_name)
                json_filename = os.path.join(output_dir, f'{safe_name}.json')
                
                with open(json_filename, 'w', encoding='utf-8') as f:
                    json.dump(platform_data, f, indent=2, ensure_ascii=False)
                
                print(f"  Saved to {json_filename}")
                
                platform_count += 1
                total_games += len(games)
            
            # Be respectful - add a small delay between requests
            time.sleep(1)
    
    # Create index file
    index_data = {
        'source': BASE_URL,
        'scraped_date': time.strftime('%Y-%m-%d %H:%M:%S'),
        'total_platforms': platform_count,
        'total_games': total_games
    }
    
    with open(os.path.join(output_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)
    
    print(f"\nScraping complete!")
    print(f"Total platforms: {platform_count}")
    print(f"Total games: {total_games}")
    
    return True

if __name__ == "__main__":
    scrape_no_intro()
