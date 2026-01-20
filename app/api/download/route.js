import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Required for streaming large files properly

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) return new NextResponse('Missing URL', { status: 400 });

    try {
        console.log(`[Proxy] Streaming: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://myrient.erista.me/'
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            console.error(`[Proxy] Upstream error: ${response.status}`);
            return new NextResponse(`Upstream Error: ${response.status}`, { status: response.status });
        }

        // Prepare headers for the browser
        const headers = new Headers();
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');

        // Extract filename from URL
        const filename = url.split('/').pop().split('?')[0] || 'download.zip';

        headers.set('Content-Type', contentType);
        if (contentLength) headers.set('Content-Length', contentLength);
        headers.set('Content-Disposition', `attachment; filename="${decodeURIComponent(filename)}"`);

        // Return the stream directly - download starts IMMEDIATELY
        return new NextResponse(response.body, {
            status: 200,
            headers
        });

    } catch (error) {
        console.error('[Proxy] Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
