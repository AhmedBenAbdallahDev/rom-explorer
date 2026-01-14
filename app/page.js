'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Disc, Globe, Gamepad, X, Filter, ChevronDown, Command, Folder, File, ChevronRight, Home } from 'lucide-react';

export default function Home() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isGlobalSearch, setIsGlobalSearch] = useState(false);
    const [isDeepSearch, setIsDeepSearch] = useState(false); // Default to shallow search
    const [activeProvider, setActiveProvider] = useState('all');
    const [activeTag, setActiveTag] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

    // Pagination / Infinite Scroll State
    const [visibleCount, setVisibleCount] = useState(40);
    const [loadingGames, setLoadingGames] = useState(false);
    const loadMoreRef = useRef(null);

    // Base URL for Data. In development, it uses local /data folder. 
    // In production, you can set NEXT_PUBLIC_DATA_URL in Vercel to point to your S3/CDN.
    const DATA_BASE_URL = process.env.NEXT_PUBLIC_DATA_URL || '';

    useEffect(() => {
        // Fetch the index data
        fetch(`${DATA_BASE_URL}/data/index.json`)
            .then(res => res.json())
            .then(jsonData => {
                setData(jsonData);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load data", err);
                setLoading(false);
            });
    }, []);

    // Global Keydown Listener for Auto-Search
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if active element is an input or textarea
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            // Ignore special keys
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            // Start searching on standard keys
            if (e.key.length === 1 || e.key === 'Backspace') {
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                    // We don't prevent default here so the character gets typed into the input
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Data Caching
    const [manifests, setManifests] = useState({});
    const [gameCache, setGameCache] = useState({});

    // Fetch Manifest when entered a Provider
    useEffect(() => {
        if (activeProvider !== 'all' && !manifests[activeProvider]) {
            fetch(`${DATA_BASE_URL}/data/${activeProvider}/_manifest.json`)
                .then(res => res.json())
                .then(json => setManifests(prev => ({ ...prev, [activeProvider]: json })))
                .catch(err => console.error("Failed to load manifest", err));
        }
    }, [activeProvider, manifests]);

    // Fetch Games when entered a Platform (Tag)
    useEffect(() => {
        if (activeProvider !== 'all' && activeTag !== 'all' && manifests[activeProvider]) {
            const platformNode = manifests[activeProvider][activeTag];
            if (platformNode) {
                const cacheKey = `${activeProvider}-${activeTag}`;
                if (!gameCache[cacheKey]) {
                    setLoadingGames(true);
                    // The manifest paths seem to be relative to the collection or root?
                    // Based on file view: "file":"No_Intro/nintendo___game_boy.json"
                    // It seems to include the collection folder name.
                    // So we fetch `${DATA_BASE_URL}/data/${platformNode.file}`
                    fetch(`${DATA_BASE_URL}/data/${platformNode.file}`)
                        .then(res => res.json())
                        .then(games => {
                            setGameCache(prev => ({ ...prev, [cacheKey]: games }));
                            setLoadingGames(false);
                        })
                        .catch(err => {
                            console.error("Failed to load games", err);
                            setLoadingGames(false);
                        });
                }
            }
        }
    }, [activeProvider, activeTag, manifests, gameCache]);

    // Derived state for filtering
    const filteredItems = useMemo(() => {
        if (!data) return [];

        // Helper to normalize strings for lenient search
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const normalizedTerm = normalize(searchTerm);
        const searchTokens = normalizedTerm.split(/\s+/).filter(Boolean);

        let sourceItems = [];
        let itemType = 'platform';

        // Determine Source Data (Platforms or Games)
        if (activeProvider !== 'all' && activeTag !== 'all') {
            // Level 3: Games View
            const cacheKey = `${activeProvider}-${activeTag}`;
            if (gameCache[cacheKey]) {
                sourceItems = gameCache[cacheKey].map((g, idx) => ({
                    id: `${cacheKey}-${idx}`,
                    name: g.name ? g.name.replace(/\.zip$|\.7z$/i, '') : 'Unknown', // Remove extension for display
                    provider: activeProvider, // Keep context
                    itemData: g, // Store full data (url, size, etc)
                    type: 'game'
                }));
                itemType = 'game';
            }
        } else {
            // Level 1 & 2: Platform View
            Object.entries(data.collections).forEach(([providerKey, providerData]) => {
                if (activeProvider !== 'all' && activeProvider !== providerKey) return;

                providerData.platforms.forEach(platform => {
                    if (activeTag !== 'all' && activeTag !== platform.name) return;

                    sourceItems.push({
                        id: `${providerKey}-${platform.name}`,
                        name: platform.name,
                        provider: providerKey,
                        count: platform.count,
                        type: 'platform'
                    });
                });
            });
        }

        if (!searchTerm) return sourceItems;

        return sourceItems.filter(item => {
            // For games, search name. For platforms, search name + provider.
            const textToSearch = itemType === 'game'
                ? normalize(item.name)
                : normalize(item.name + ' ' + item.provider);

            // Shalloway or Deep Search Toggle Logic could go here?
            // "Shallow Search ON" is handled by the UI restricting us to the current level (already done by render logic above).
            // "Deep Search" logic usually implies searching recursively.
            // For now, infinite scroll "Deep Search" might just mean "Search works on current list" or "Search inside files" (not implemented yet).

            // LENIENT SEARCH: All tokens must be found in the item text
            return searchTokens.every(token => textToSearch.includes(token));
        }).sort((a, b) => {
            // Basic Relevance Sorting
            const A = normalize(a.name);
            const B = normalize(b.name);
            const term = normalizedTerm;

            // Exact match gets priority
            if (A === term) return -1;
            if (B === term) return 1;

            // Starts with priority
            const aStarts = A.startsWith(term);
            const bStarts = B.startsWith(term);
            if (aStarts && !bStarts) return -1;
            if (bStarts && !aStarts) return 1;

            return 0;
        });

    }, [data, searchTerm, activeProvider, activeTag, gameCache, isDeepSearch]);

    // Unique providers and tags for filters (re-use logic but safe-guard)
    const { providers, tags } = useMemo(() => {
        if (!data) return { providers: [], tags: [] };

        const provs = Object.keys(data.collections);

        let relevantPlatforms = [];

        if (activeProvider === 'all') {
            const tagSet = new Set();
            Object.values(data.collections).forEach(p => {
                p.platforms.forEach(pl => tagSet.add(pl.name));
            });
            relevantPlatforms = Array.from(tagSet).sort();
        } else {
            const pData = data.collections[activeProvider];
            relevantPlatforms = pData ? pData.platforms.map(pl => pl.name).sort() : [];
        }

        return { providers: provs, tags: relevantPlatforms };
    }, [data, activeProvider]);

    const toggleGlobalSearch = () => {
        const newState = !isGlobalSearch;
        setIsGlobalSearch(newState);
        if (newState) {
            setActiveProvider('all');
            setActiveTag('all');
            setIsDeepSearch(true); // Usually global applies deeply
        }
    };

    // Infinite Scroll Logic
    const visibleItems = useMemo(() => {
        return filteredItems.slice(0, visibleCount);
    }, [filteredItems, visibleCount]);

    useEffect(() => {
        // Reset pagination when search or filters change
        setVisibleCount(40);
    }, [searchTerm, activeProvider, activeTag, isGlobalSearch, isDeepSearch]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => prev + 40);
                }
            },
            { rootMargin: '100px' }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [visibleItems, loadMoreRef]);


    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-bg-primary text-white">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                <p className="text-text-muted animate-pulse">Initializing Database...</p>
            </div>
        </div>
    );

    return (
        <main className="min-h-screen bg-bg-primary text-text-primary p-6 relative overflow-x-hidden font-sans">

            {/* Background Ambient Glow */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
            </div>

            {/* Floating Header / Search Bar */}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${searchTerm ? 'translate-y-0 opacity-100' : 'translate-y-0'}`}>
                <div className="backdrop-blur-xl bg-bg-secondary/80 border-b border-white/5 shadow-lg">
                    <div className="max-w-7xl mx-auto px-6 py-4">

                        <div className="flex flex-col gap-4">
                            {/* Search Input Area */}
                            <div className="flex items-center gap-4 relative">
                                <Search className={`w-6 h-6 ${searchTerm ? 'text-accent' : 'text-text-muted'} transition-colors`} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Type to search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-transparent border-none outline-none text-2xl font-medium w-full placeholder:text-text-muted/50 text-white h-12"
                                />

                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                        <X className="w-5 h-5 text-text-muted" />
                                    </button>
                                )}

                                <div className="hidden md:flex items-center gap-2 text-xs text-text-muted border border-white/10 px-2 py-1 rounded">
                                    <Command className="w-3 h-3" />
                                    <span>ANY KEY</span>
                                </div>
                            </div>

                            {/* Dynamic Filters */}
                            <div className={`flex flex-col gap-2 transition-all duration-300 ${searchTerm || activeProvider !== 'all' ? 'opacity-100 max-h-40' : 'opacity-100 max-h-40'}`}>
                                {/* Providers Row */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-2">Providers</span>
                                    <button
                                        onClick={() => setActiveProvider('all')}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${activeProvider === 'all' ? 'bg-accent text-white border-accent' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                    >
                                        All
                                    </button>
                                    {providers.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setActiveProvider(p)}
                                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${activeProvider === p ? 'bg-accent text-white border-accent' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>

                                {/* Tags Row */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-2">Platforms</span>
                                    <button
                                        onClick={() => setActiveTag('all')}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${activeTag === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                    >
                                        All
                                    </button>
                                    {tags.slice(0, 100).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setActiveTag(t)}
                                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${activeTag === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </header>

            {/* Spacer for fixed header */}
            <div className="h-40"></div>

            {/* Breadcrumbs / Search Info */}
            <div className="max-w-7xl mx-auto mb-4">
                <div className="flex flex-col gap-4">

                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-2 text-sm text-text-muted overflow-x-auto whitespace-nowrap pb-2 scrollbar-hide">
                        <button
                            onClick={() => { setActiveProvider('all'); setActiveTag('all'); }}
                            className="hover:text-white flex items-center gap-1 transition-colors"
                        >
                            <Home className="w-4 h-4" />
                            Home
                        </button>

                        {activeProvider !== 'all' && (
                            <>
                                <ChevronRight className="w-4 h-4 opacity-50" />
                                <button
                                    onClick={() => setActiveTag('all')}
                                    className={`hover:text-white transition-colors ${activeTag === 'all' ? 'text-white font-medium' : ''}`}
                                >
                                    {activeProvider}
                                </button>
                            </>
                        )}

                        {activeTag !== 'all' && (
                            <>
                                <ChevronRight className="w-4 h-4 opacity-50" />
                                <span className="text-white font-medium">
                                    {activeTag}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
                    <h2 className="text-xl text-text-secondary font-medium flex items-center gap-3">
                        {searchTerm ? `Searching for "${searchTerm}"` : (activeTag !== 'all' ? activeTag : (activeProvider !== 'all' ? activeProvider : 'All Collections'))}
                        <span className="text-sm text-text-muted bg-white/5 px-2 py-0.5 rounded-md">
                            {filteredItems.length} items
                        </span>
                    </h2>

                    {/* ... (Search Toggles kept from previous step) ... */}
                    <div className="flex items-center gap-3">
                        {/* Shallow/Deep Search Toggle */}
                        <div className="relative group">
                            <button
                                onClick={() => setIsDeepSearch(!isDeepSearch)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all border ${isDeepSearch ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-white/5 border-white/5 text-text-muted hover:bg-white/10'}`}
                            >
                                <Filter className="w-4 h-4" />
                                {isDeepSearch ? 'Deep Search' : 'Shallow Search'}
                            </button>
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-black/90 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                {isDeepSearch ? 'Searching subfolders & files' : 'Searching top-level only'}
                            </div>
                        </div>

                        {/* Toggle Global Search */}
                        <button
                            onClick={toggleGlobalSearch}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all border ${isGlobalSearch ? 'bg-accent/20 border-accent text-accent' : 'bg-white/5 border-white/5 text-text-muted hover:bg-white/10'}`}
                        >
                            <Globe className="w-4 h-4" />
                            Global {isGlobalSearch ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {loadingGames ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-text-muted animate-pulse">Loading games...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                        <Disc className="w-16 h-16 opacity-20 mb-4" />
                        <p>No items found matching your criteria.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {visibleItems.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        if (item.type === 'platform') {
                                            setActiveProvider(item.provider);
                                            setActiveTag(item.name);
                                            setSearchTerm(''); // Clear search on drill down? User choice. Let's clear to show content.
                                        } else {
                                            // Handle Game Click (e.g., Download or Details)
                                            window.open(item.itemData.url, '_blank');
                                        }
                                    }}
                                    className="group relative bg-bg-card border border-white/5 hover:border-accent/50 rounded-xl p-4 transition-all hover:translate-y-[-2px] hover:shadow-lg hover:shadow-accent/10 cursor-pointer overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-accent rounded-full p-1.5">
                                            {item.type === 'platform' ? <Folder className="w-3 h-3 text-white" /> : <File className="w-3 h-3 text-white" />}
                                        </div>
                                    </div>

                                    <div className="flex flex-col h-full">
                                        <div className="mb-3">
                                            <span className={`text-xs font-mono px-2 py-0.5 rounded ${item.type === 'platform' ? 'text-accent bg-accent/10' : 'text-green-400 bg-green-500/10'}`}>
                                                {item.type === 'platform' ? 'COLLECTION' : 'FILE'}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-text-primary mb-1 line-clamp-2 leading-tight group-hover:text-accent transition-colors">
                                            {item.name}
                                        </h3>
                                        <div className="mt-auto pt-4 flex items-center justify-between text-xs text-text-muted">
                                            {item.type === 'platform' ? (
                                                <span className="flex items-center gap-1">
                                                    <Folder className="w-3 h-3" />
                                                    {item.count ? item.count.toLocaleString() : '?'} Items
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1">
                                                    <Disc className="w-3 h-3" />
                                                    {item.itemData.size}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Load More Sentinel */}
                        {visibleItems.length < filteredItems.length && (
                            <div ref={loadMoreRef} className="py-8 flex justify-center w-full">
                                <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer */}
            <footer className="mt-20 py-10 border-t border-white/5 text-center text-text-muted text-sm">
                <p>© 2026 Myrient Explorer. <span className="opacity-50">Press 'K' or start typing to search.</span></p>
            </footer>

        </main>
    );
}
