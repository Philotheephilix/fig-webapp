import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

interface WSRequestData {
    uuid: string;
    url: string;
    method: 'GET' | 'POST';
    headers: Record<string, string[]>;
    raw_body: {
        is_base64: boolean;
        data: string;
    };
}

interface CircuitTestRequest {
    wsMessageData: WSRequestData;
    sessionId: string;
}

export async function POST(request: NextRequest) {
    try {
        const { wsMessageData, sessionId }: CircuitTestRequest = await request.json();

        if (!wsMessageData || !sessionId) {
            return NextResponse.json(
                { error: 'WebSocket message data and session ID are required' },
                { status: 400 }
            );
        }

        const { url, method, headers, raw_body } = wsMessageData;

        if (!url) {
            return NextResponse.json(
                { error: 'URL is required in WebSocket message data' },
                { status: 400 }
            );
        }

        console.log(`Executing ${method} request from WebSocket message to: ${url}`);
        console.log('Session ID:', sessionId);

        // Build curl command
        const curlArgs = [
            '-X', method,
            '-H', 'Content-Type: application/json',
            '-H', 'User-Agent: Circuit-Test-Bot/1.0',
        ];

        // Add custom headers from WebSocket message
        Object.entries(headers).forEach(([key, values]) => {
            values.forEach(value => {
                curlArgs.push('-H', `${key}: ${value}`);
            });
        });

        // Add body for POST requests
        if (method === 'POST' && raw_body.data) {
            curlArgs.push('-d', raw_body.data);
        }

        // Add URL
        curlArgs.push(url);

        console.log('Executing curl with args:', curlArgs);

        // Execute curl command
        const result = await new Promise((resolve, reject) => {
            const curlProcess = spawn('curl', curlArgs);

            let stdout = '';
            let stderr = '';

            curlProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            curlProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            curlProcess.on('close', (code) => {
                resolve({
                    statusCode: code,
                    response: stdout,
                    error: stderr,
                    url,
                    method,
                    timestamp: new Date().toISOString(),
                    sessionId,
                    uuid: wsMessageData.uuid,
                });
            });

            curlProcess.on('error', (error) => {
                console.error('Curl execution error:', error);
                reject(error);
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                curlProcess.kill();
                reject(new Error('Request execution timeout'));
            }, 30000);
        });

        console.log('Curl execution completed:', result);

        return NextResponse.json({
            success: true,
            result,
            message: 'Request executed successfully from WebSocket message',
            sessionId,
            uuid: wsMessageData.uuid
        });

    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json(
            { error: `Request failed: ${(error as Error).message}` },
            { status: 500 }
        );
    }
}


