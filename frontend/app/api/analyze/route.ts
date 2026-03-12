import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:22555';

export async function POST(request: NextRequest) {
  try {
    // Forward the multipart form data to the backend
    const formData = await request.formData();

    const backendResponse = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      body: formData,
      // No timeout - large image processing can take time
      signal: AbortSignal.timeout(300000), // 5 minutes
    });

    // Read the response
    const contentType = backendResponse.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await backendResponse.json();
      return NextResponse.json(data, { status: backendResponse.status });
    } else {
      // Backend returned non-JSON (shouldn't happen with our fix, but just in case)
      const text = await backendResponse.text();
      return NextResponse.json(
        { detail: text || `Backend error (${backendResponse.status})` },
        { status: backendResponse.status }
      );
    }
  } catch (error) {
    console.error('[API Proxy] Error forwarding to backend:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Differentiate connection errors from other errors
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return NextResponse.json(
        { detail: 'Backend service is not reachable. Please ensure the backend container is running.' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { detail: `Proxy error: ${message}` },
      { status: 502 }
    );
  }
}

// Route segment config - set max duration and disable body size limit
export const maxDuration = 300; // 5 minutes for long processing
export const dynamic = 'force-dynamic';
