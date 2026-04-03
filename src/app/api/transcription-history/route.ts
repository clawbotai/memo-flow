import { NextRequest, NextResponse } from 'next/server';
import {
  getAllTranscriptionRecords,
  getTranscriptionRecord,
  deleteTranscriptionRecord,
} from '@/lib/transcription-history';
import type { TranscriptionRecord } from '@/types/transcription-history';

export async function GET(request: NextRequest) {
  try {
    // 解析 URL 参数
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // 获取特定转录记录详情
      const record = await getTranscriptionRecord(id);

      if (!record) {
        return NextResponse.json(
          { success: false, error: '转录记录不存在' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: record,
      });
    } else {
      // 获取所有转录记录
      const records = await getAllTranscriptionRecords();

      return NextResponse.json({
        success: true,
        data: records,
      });
    }
  } catch (error) {
    console.error('获取转录记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取转录记录失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }

    const deleted = await deleteTranscriptionRecord(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: '转录记录不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '转录记录已删除',
    });
  } catch (error) {
    console.error('删除转录记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除转录记录失败' },
      { status: 500 }
    );
  }
}