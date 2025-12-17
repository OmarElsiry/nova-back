import { ValueObject } from '../../base/ValueObject';
import { Result } from '../../../shared/Result';

interface TelegramIdProps {
  value: string;
}

export class TelegramId extends ValueObject<TelegramIdProps> {
  get value(): string {
    return this.props.value;
  }

  private constructor(props: TelegramIdProps) {
    super(props);
  }

  public static create(telegramId: string): Result<TelegramId> {
    if (!telegramId || telegramId.trim().length === 0) {
      return Result.fail<TelegramId>('Telegram ID cannot be empty');
    }

    if (!/^\d+$/.test(telegramId)) {
      return Result.fail<TelegramId>('Telegram ID must contain only digits');
    }

    return Result.ok<TelegramId>(new TelegramId({ value: telegramId }));
  }

  public override toString(): string {
    return this.value;
  }
}
