import fs from 'node:fs';
import path from 'node:path';
import type { QuestionSetInfo } from '../shared/types';

export interface Question {
  text: string;
  answers: string[];
  correct: number[];
  time: number;
  readTime: number;
  points: number;
  image?: string;
}

export interface QuestionSet {
  id: string;
  title: string;
  questions: Question[];
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  errors: string[];
}

const LETTERS = ['A', 'B', 'C', 'D'];

function parseCorrect(raw: unknown, answerCount: number): number[] | null {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: number[] = [];
  for (const item of list) {
    let idx = -1;
    if (typeof item === 'number' && Number.isInteger(item)) idx = item;
    else if (typeof item === 'string') idx = LETTERS.indexOf(item.trim().toUpperCase());
    if (idx < 0 || idx >= answerCount) return null;
    if (!out.includes(idx)) out.push(idx);
  }
  return out.length ? out : null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function parseQuestionSet(id: string, data: any): QuestionSet {
  const errors: string[] = [];
  const defaults = data?.defaults ?? {};
  const defTime = num(defaults.time, 20);
  const defRead = num(defaults.readTime, 3);
  const defPoints = num(defaults.points, 1);
  const questions: Question[] = [];
  const list: unknown[] = Array.isArray(data?.questions) ? data.questions : [];
  if (!list.length) errors.push('Không có câu hỏi nào (cần mảng "questions").');

  list.forEach((q: any, i) => {
    const where = `Câu ${i + 1}`;
    const text = typeof q?.question === 'string' ? q.question.trim() : '';
    if (!text) return errors.push(`${where}: thiếu "question".`);
    const answers: string[] = Array.isArray(q.answers) ? q.answers.map((a: unknown) => String(a)) : [];
    if (answers.length < 2 || answers.length > 4) return errors.push(`${where}: "answers" phải có 2–4 phương án.`);
    const correct = parseCorrect(q.correct, answers.length);
    if (!correct) return errors.push(`${where}: "correct" không hợp lệ (dùng số 0–${answers.length - 1}, chữ A–${LETTERS[answers.length - 1]} hoặc mảng).`);
    questions.push({
      text,
      answers,
      correct,
      time: Math.max(3, num(q.time, defTime)),
      readTime: num(q.readTime, defRead),
      points: num(q.points, defPoints),
      image: typeof q.image === 'string' && q.image ? q.image : undefined,
    });
  });

  return {
    id,
    title: typeof data?.title === 'string' && data.title ? data.title : id,
    questions,
    shuffleQuestions: !!data?.shuffleQuestions,
    shuffleAnswers: !!data?.shuffleAnswers,
    errors,
  };
}

export function loadQuestionSets(dir: string): QuestionSet[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort()
    .map((file) => {
      const id = file.replace(/\.json$/i, '');
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '');
        return parseQuestionSet(id, JSON.parse(raw));
      } catch (err) {
        return { id, title: file, questions: [], shuffleQuestions: false, shuffleAnswers: false, errors: [`Lỗi JSON: ${(err as Error).message}`] };
      }
    });
}

export function setInfo(s: QuestionSet): QuestionSetInfo {
  return { id: s.id, title: s.title, count: s.questions.length, errors: s.errors };
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Returns the question list for one game, applying the set's shuffle options. */
export function prepareQuestions(s: QuestionSet): Question[] {
  let qs = s.shuffleQuestions ? shuffle(s.questions) : s.questions.slice();
  if (s.shuffleAnswers) {
    qs = qs.map((q) => {
      const order = shuffle(q.answers.map((_, i) => i));
      return { ...q, answers: order.map((i) => q.answers[i]), correct: q.correct.map((c) => order.indexOf(c)) };
    });
  }
  return qs;
}
