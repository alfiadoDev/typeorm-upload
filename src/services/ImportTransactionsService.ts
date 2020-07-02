import fs from 'fs';
import csvParser from 'csv-parse';
import { getCustomRepository, getRepository, In } from 'typeorm';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CsvTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoryRepository = getRepository(Category);

    const contactReadyStream = fs.createReadStream(filePath);

    const parsers = csvParser({
      from_line: 2,
    });

    const parseCSV = contactReadyStream.pipe(parsers);

    const transactions: CsvTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) => {
        return cell.trim();
      });

      if (!title || !type || !value) return;

      transactions.push({ title, type, value, category });
      categories.push(category);
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const existentsCategories = await categoryRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentsCategoriesTitle = existentsCategories.map(
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      .filter(category => !existentsCategoriesTitle.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoryRepository.create(
      addCategoryTitles.map(title => ({ title })),
    );

    await categoryRepository.save(newCategories);

    const finalyCategories = [...newCategories, ...existentsCategories];
    const transactionsCreate = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalyCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(transactionsCreate);

    await fs.promises.unlink(filePath);
    return transactionsCreate;
  }
}

export default ImportTransactionsService;
