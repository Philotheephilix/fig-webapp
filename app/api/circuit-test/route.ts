import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

interface CircuitTestRequest {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string[]>;
    body?: string;
}

export async function POST(request: NextRequest) {
    try {
        const { url, method, headers = {}, body = '' }: CircuitTestRequest = await request.json();

        if (!url) {
            return NextResponse.json(
                { error: 'URL is required' },
                { status: 400 }
            );
        }

        console.log(`Executing ${method} request to: ${url}`);

        // Build curl command
        const curlArgs = [
            '-X', method,
            '-H', 'Content-Type: application/json',
            '-H', 'User-Agent: Circuit-Test-Bot/1.0',
        ];

        // Add custom headers
        Object.entries(headers).forEach(([key, values]) => {
            values.forEach(value => {
                curlArgs.push('-H', `${key}: ${value}`);
            });
        });

        // Add body for POST requests
        if (method === 'POST' && body) {
            curlArgs.push('-d', body);
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
            message: 'Request executed successfully'
        });

    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json(
            { error: `Request failed: ${(error as Error).message}` },
            { status: 500 }
        );
    }
}
