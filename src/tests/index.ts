import path from 'path';
import rimraf from 'rimraf';
import { processImages } from '../index';

async function doTest(): Promise<void> {
  await Promise.all(
    [
      '../images0_out/**/*',
      '../images1_out/**/*',
      '../images2_out/**/*',
      '../images3_out/**/*',
    ].map(p => {
      return new Promise((resolve, reject) => {
        rimraf(p, err => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });
    })
  );

  await Promise.all([
    processImages({
      absolute_directory_path: path.join(__dirname, 'images0'),
      absolute_output_directory_path: path.join(__dirname, 'images0_out'),
      versions: [{ height: 400 }, { height: 200 }, { height: 80 }],
    }),
    processImages({
      absolute_directory_path: path.join(__dirname, 'images1'),
      absolute_output_directory_path: path.join(__dirname, 'images1_out'),
      versions: [{ height: 400 }, { height: 200 }, { height: 80 }],
    }),
    processImages({
      absolute_directory_path: path.join(__dirname, 'images2'),
      absolute_output_directory_path: path.join(__dirname, 'images2_out'),
      versions: [{ height: 400 }, { height: 200 }, { height: 80 }],
    }),
    processImages({
      absolute_directory_path: path.join(__dirname, 'images3'),
      absolute_output_directory_path: path.join(__dirname, 'images3_out'),
      versions: [{ height: 400 }, { height: 200 }, { height: 80 }],
    }),
  ]);
}

doTest()
  .then(console.log)
  .catch(console.error);
